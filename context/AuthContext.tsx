import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { User, Session, AuthError } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { UserProfile, UserRole } from '../types';
import { logger } from '../lib/logger';
import { firebaseAuth, RecaptchaVerifier, signInWithPhoneNumber, GoogleAuthProvider, signInWithPopup } from '../lib/firebase';
import type { ConfirmationResult } from '../lib/firebase';
import { auditAuthEvent, markSignedIn, markSignedOut } from '../lib/auditClient';
import { presenceManager } from '../lib/presenceManager';

const PROFILE_CACHE_KEY = 'bistro_cached_profile';
const SUBSCRIPTION_CACHE_KEY = 'bistro_cached_subscription';
// Firma del último login registrado (uid|last_sign_in_at). Evita registrar
// login.success duplicados cuando SIGNED_IN se redispara por reconexión/foco.
const SIGNIN_MARK_KEY = 'bistro_signin_mark';

// Método de acceso real elegido por el usuario (pin, firebase_otp, google_oauth,
// email_password). Cada función de login lo fija justo antes de crear la sesión y
// el handler SIGNED_IN lo consume, porque `app_metadata.provider` de Supabase no
// distingue PIN de SMS (ambos usan el correo sintético = provider 'email').
const PENDING_AUTH_METHOD_KEY = 'bistro_pending_auth_method';
const setPendingAuthMethod = (method: string): void => {
  try { localStorage.setItem(PENDING_AUTH_METHOD_KEY, method); } catch { /* no-op */ }
};

const getCachedProfile = (): UserProfile | null => {
  try {
    const raw = localStorage.getItem(PROFILE_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
};

const cacheProfile = (p: UserProfile) => {
  try { localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(p)); } catch { }
};

const getCachedSubscription = () => {
  try {
    const raw = localStorage.getItem(SUBSCRIPTION_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);

    if (parsed.hasActive && parsed.endDate) {
      const endDate = new Date(parsed.endDate);
      const now = new Date();
      const notExpired = endDate > now;
      const hoursOverdue = (now.getTime() - endDate.getTime()) / (1000 * 60 * 60);
      const inGracePeriod = !notExpired && hoursOverdue <= 48;
      
      parsed.hasActive = notExpired || inGracePeriod;
    }
    return parsed;
  } catch { return null; }
};

const cacheSubscription = (data: { hasActive: boolean; endDate: string | null }) => {
  try { localStorage.setItem(SUBSCRIPTION_CACHE_KEY, JSON.stringify(data)); } catch { }
};

const checkIsOffline = (): boolean => !navigator.onLine;

// Shape del plan anidado que devuelve el join con `subscription_plans`.
// `assigned_business_id` distingue un plan personalizado (asignado a un negocio
// específico) de un plan público (null). Lo consume `useCustomPlan()`.
export interface SubscriptionPlan {
  id: string;
  name: string;
  price_monthly: number;
  initial_period_months: number;
  assigned_business_id: string | null;
  features: unknown[];
  is_active: boolean;
}

// Fila de `business_subscriptions` con el plan anidado.
// El resto de campos vienen del `select('*')` de Supabase (plan_id, status,
// current_period_*, next_billing_date, etc.). Se tipan como opcionales/laxos
// porque no todos los consumidores los usan y no hay una fuente central de
// verdad para el esquema todavía.
export interface Subscription {
  id: string;
  business_id: string;
  plan_id: string;
  status: string;
  current_period_start: string;
  current_period_end: string;
  next_billing_date: string | null;
  plan: SubscriptionPlan | null;
  [key: string]: unknown;
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  session: Session | null;
  loading: boolean;
  hasActiveSubscription: boolean | null; // null = loading, true/false = checked
  subscriptionEndDate: Date | null; // End date of current subscription period
  subscription: Subscription | null; // Fila de business_subscriptions con plan anidado
  isNewTrial: boolean;
  clearNewTrialFlag: () => void;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signUp: (email: string, password: string, fullName: string, businessName: string, phone?: string) => Promise<{ data: { user: User | null; session: Session | null } | null; error: AuthError | null }>;
  signOut: () => Promise<void>;
  signInWithGoogle: () => Promise<{ error: AuthError | null }>;
  signInWithPhone: (phone: string) => Promise<{ error: AuthError | null }>;
  verifyOTP: (phone: string, token: string, mode?: 'login' | 'register') => Promise<{ error: AuthError | null }>;
  userExistsByPhone: (phone: string) => Promise<boolean>;
  signInWithPin: (phone: string, pin: string) => Promise<{ error: AuthError | null }>;
  confirmFirebaseOtp: (token: string) => Promise<{ error: AuthError | null }>;
  finishPhoneRegistration: (pin: string) => Promise<{ error: AuthError | null }>;
  resetPassword: (email: string) => Promise<{ error: AuthError | null }>;
  updatePassword: (newPassword: string) => Promise<{ error: AuthError | null }>;
  refreshProfile: () => Promise<void>;
  checkSubscription: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    return {
      user: null,
      session: null,
      profile: null,
      business: null,
      currentBranch: null,
      userRole: null,
      isStaff: false,
      isOwner: false,
      isPlatformAdmin: false,
      isEmailVerified: false,
      loginWithPhone: async () => {},
      verifyOtp: async () => {},
      signOut: async () => {},
      refreshSession: async () => {},
      checkSubscription: async () => {},
    } as any;
  }
  return context;
};

interface AuthProviderProps {
  children: React.ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasActiveSubscription, setHasActiveSubscription] = useState<boolean | null>(null);
  const [subscriptionEndDate, setSubscriptionEndDate] = useState<Date | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [isNewTrial, setIsNewTrial] = useState(false);

  // Fetch user profile from database with retry logic
  const fetchProfile = useCallback(async (userId: string, userEmail: string, retryCount = 0): Promise<UserProfile | null> => {
    const maxRetries = 5;
    const baseDelay = 500; // Start with 500ms delay between retries

    logger.log(`[AuthContext] fetchProfile llamado - userId: ${userId}, email: ${userEmail}, intento: ${retryCount + 1}/${maxRetries + 1}`);

    try {
      // Si estamos offline y hay cache, usarlo inmediatamente sin intentar queries
      if (!navigator.onLine) {
        const cached = getCachedProfile();
        if (cached && cached.id === userId) {
          logger.log('[AuthContext] Offline detectado, usando perfil cacheado directamente');
          return cached;
        }
      }

      const { data: sessionData } = await supabase.auth.getSession();
      logger.log(`[AuthContext] Estado de sesi├│n:`, {
        hasSession: !!sessionData.session,
        sessionUserId: sessionData.session?.user?.id,
        accessToken: sessionData.session?.access_token ? 'presente' : 'ausente',
        expiresAt: sessionData.session?.expires_at
      });

      const { data, error, status } = await supabase
        .from('profiles')
        .select('id, business_id, full_name, phone, role, role_id, avatar_url, custom_permissions, is_active, offline_prefix, businesses:business_id(name), roles:role_id(permissions)')
        .eq('id', userId)
        .maybeSingle();

      logger.log(`[AuthContext] Respuesta de profiles:`, { data, error, status });

      if (error) {
        console.error("[AuthContext] Error fetching profile:", error);

        // Detectar Lie-Fi (Desktop suele marcar onLine=true aunque no haya internet)
        const isNetworkError = error.message?.includes('fetch') || error.message?.toLowerCase().includes('network') || error.message?.includes('Failed to fetch') || (status as number) === 0;
        if (isNetworkError) {
          const cached = getCachedProfile();
          if (cached && cached.id === userId) {
            logger.log('[AuthContext] Error de red detectado (Lie-Fi), usando perfil cacheado instant├íneamente');
            return cached;
          }
        }

        if (error.code === 'PGRST116' && retryCount < maxRetries) {
          logger.log(`[AuthContext] Error PGRST116, reintentando...`);
          await new Promise(resolve => setTimeout(resolve, baseDelay * Math.pow(2, retryCount)));
          return fetchProfile(userId, userEmail, retryCount + 1);
        }
        return null;
      }

      if (!data && retryCount < maxRetries) {
        logger.log(`[AuthContext] Profile no encontrado para ${userId}, reintentando (${retryCount + 1}/${maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, baseDelay * Math.pow(2, retryCount)));
        return fetchProfile(userId, userEmail, retryCount + 1);
      }

      if (!data) {
        console.error(`[AuthContext] Profile no encontrado despu├®s de ${maxRetries} intentos`);
        // Fallback final a cach├® en caso extremo
        const cached = getCachedProfile();
        if (cached && cached.id === userId) {
          logger.log('[AuthContext] Usando perfil cacheado (exhaustos intentos online)');
          return cached;
        }
        return null;
      }

      // Si el empleado fue desactivado, cerrar sesi├│n inmediatamente
      if ((data as any).is_active === false) {
        console.warn('[AuthContext] Cuenta desactivada, forzando cierre de sesi├│n');
        await supabase.auth.signOut();
        return null;
      }

      logger.log(`[AuthContext] Profile cargado exitosamente:`, data);
      const businessData = data.businesses as any;
      const roleData = data.roles as any;
      const rolePerms: Record<string, boolean> = roleData?.permissions || {};
      const customPerms: Record<string, boolean> = (data as any).custom_permissions || {};
      const effectivePermissions = { ...rolePerms, ...customPerms };

      let offlinePrefix: string | null = (data as any).offline_prefix || null;

      // Auto-asignar letra aleatoria ├║nica si no tiene una
      if (!offlinePrefix && data.business_id) {
        try {
          const { data: existingPrefixes } = await supabase
            .from('profiles')
            .select('offline_prefix')
            .eq('business_id', data.business_id)
            .not('offline_prefix', 'is', null);

          const usedLetters = new Set(
            (existingPrefixes || []).map((p: any) => p.offline_prefix).filter(Boolean)
          );
          const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
          const available = alphabet.split('').find(l => !usedLetters.has(l));

          if (available) {
            await supabase
              .from('profiles')
              .update({ offline_prefix: available })
              .eq('id', userId);
            offlinePrefix = available;
          }
        } catch (e) {
          console.warn('[AuthContext] Could not assign offline_prefix:', e);
        }
      }

      // Cachear conteo de empleados activos del negocio para decisiones offline
      if (data.business_id) {
        supabase
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('business_id', data.business_id)
          .eq('is_active', true)
          .then(({ count }) => {
            if (count !== null) {
              try { localStorage.setItem('bistro_active_employees_count', String(count)); } catch { }
            }
          });
      }

      const userProfile: UserProfile = {
        id: data.id,
        email: userEmail,
        full_name: data.full_name,
        phone: data.phone,
        role: data.role as UserRole,
        role_id: (data as any).role_id || null,
        avatar_url: data.avatar_url,
        business_id: data.business_id,
        business_name: businessData?.name || null,
        permissions: effectivePermissions,
        is_active: (data as any).is_active ?? true,
        offline_prefix: offlinePrefix,
      };
      cacheProfile(userProfile);
      return userProfile;
    } catch (err: any) {
      console.error("[AuthContext] Exception fetching profile:", err);

      const isNetworkError = err.message?.includes('fetch') || err.message?.toLowerCase().includes('network') || err.message?.includes('Failed to fetch') || !navigator.onLine;
      if (isNetworkError) {
        const cached = getCachedProfile();
        if (cached && cached.id === userId) {
          logger.log('[AuthContext] Excepci├│n de red detectada (Lie-Fi), usando perfil cacheado');
          return cached;
        }
      }

      if (retryCount < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, baseDelay * Math.pow(2, retryCount)));
        return fetchProfile(userId, userEmail, retryCount + 1);
      }

      // Fallback final a cach├® en caso de error no recuperable
      const finalCached = getCachedProfile();
      if (finalCached && finalCached.id === userId) {
        logger.log('[AuthContext] Usando perfil cacheado final (tras error)');
        return finalCached;
      }
      return null;
    }
  }, []);

  // Track profile fetching to prevent duplicate requests
  const isFetchingProfileRef = React.useRef(false);
  const currentUserIdRef = React.useRef<string | null>(null);
  const profileLoadedRef = React.useRef(false);
  // Dedupe de login.success: SIGNED_IN puede dispararse más de una vez.
  const loggedInUidRef = React.useRef<string | null>(null);

  // Initialize auth state
  useEffect(() => {
    logger.log(`[AuthContext] useEffect montando...`);

    const handleAuthChange = async (event: string, session: any) => {
      console.log(`[AuthContext] 🔄 Evento: ${event}`, {
        hasSession: !!session,
        userId: session?.user?.id,
        expiresAt: session?.expires_at ? new Date(session.expires_at * 1000).toLocaleString() : 'N/A',
        navigatorOnLine: navigator.onLine,
        hasCachedProfile: !!getCachedProfile(),
      });

      if (event === 'SIGNED_OUT') {
        console.log('[AuthContext] ⚠️ SIGNED_OUT. Caché:', !!getCachedProfile());
        const cached = getCachedProfile();
        if (cached) {
          console.log('[AuthContext] Hay caché → llamando checkIsOffline()...');
          const offline = checkIsOffline();
          console.log('[AuthContext] Resultado offline:', offline);
          if (offline) {
            console.log('[AuthContext] ÔÜí SIGNED_OUT offline con cache ÔåÆ usando cache');
            setProfile(cached);
            profileLoadedRef.current = true;
            currentUserIdRef.current = cached.id;
            setLoading(false);
            const cachedSub = getCachedSubscription();
            if (cachedSub) {
              setHasActiveSubscription(cachedSub.hasActive);
              setSubscriptionEndDate(cachedSub.endDate ? new Date(cachedSub.endDate) : null);
            }
            return;
          }
          // Online: intentar refrescar la sesi├│n antes de limpiar
          console.log('[AuthContext] SIGNED_OUT online ÔåÆ intentando refreshSession antes de limpiar');
          try {
            const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
            if (!refreshError && refreshData.session) {
              console.log('[AuthContext] Ô£à Sesi├│n recuperada v├¡a refresh, no mostrando login');
              // El onAuthStateChange disparar├í TOKEN_REFRESHED o SIGNED_IN con la sesi├│n nueva
              return;
            }
          } catch { }
          console.log('[AuthContext] SIGNED_OUT online sin refresh v├ílido ÔåÆ limpiando cache y estado');
          localStorage.removeItem(PROFILE_CACHE_KEY);
          localStorage.removeItem(SUBSCRIPTION_CACHE_KEY);
        }
        setSession(null);
        setUser(null);
        setProfile(null);
        setHasActiveSubscription(null);
        setSubscription(null);
        setLoading(false);
        isFetchingProfileRef.current = false;
        currentUserIdRef.current = null;
        profileLoadedRef.current = false;
        return;
      }

      if (session?.user) {
        setSession(session);
        setUser(session.user);

        const isNewUser = currentUserIdRef.current !== session.user.id;
        const isSignIn = event === 'SIGNED_IN';
        const needsProfile = isNewUser || (isSignIn && !profileLoadedRef.current);

        if (needsProfile && !isFetchingProfileRef.current) {
          isFetchingProfileRef.current = true;
          currentUserIdRef.current = session.user.id;
          profileLoadedRef.current = false;

          const userProfile = await fetchProfile(session.user.id, session.user.email || '');

          console.log(`[AuthContext] Resultado del perfil:`, userProfile ? 'OK' : 'NULL');
          setProfile(userProfile);
          profileLoadedRef.current = !!userProfile;
          isFetchingProfileRef.current = false;
        } else if (event === 'TOKEN_REFRESHED') {
          logger.log(`[AuthContext] Token refrescado, perfil ya cargado`);
        }
      } else {
        const cached = getCachedProfile();
        console.log('[AuthContext] Sesión null. Caché:', !!cached, 'onLine:', navigator.onLine);
        if (cached) {
          console.log('[AuthContext] → checkIsOffline()...');
          const offline = checkIsOffline();
          console.log('[AuthContext] Resultado:', offline ? 'OFFLINE → usando caché' : 'ONLINE → limpiando caché');
          if (offline) {
            console.log('[AuthContext] ÔÜí Sesi├│n null offline ÔåÆ usando cache');
            setProfile(cached);
            profileLoadedRef.current = true;
            currentUserIdRef.current = cached.id;
            const cachedSub = getCachedSubscription();
            if (cachedSub) {
              setHasActiveSubscription(cachedSub.hasActive);
              setSubscriptionEndDate(cachedSub.endDate ? new Date(cachedSub.endDate) : null);
            }
          } else {
            console.log('[AuthContext] Sesi├│n null online ÔåÆ limpiando cache');
            localStorage.removeItem(PROFILE_CACHE_KEY);
            localStorage.removeItem(SUBSCRIPTION_CACHE_KEY);
            setSession(null);
            setUser(null);
            setProfile(null);
            profileLoadedRef.current = false;
          }
        } else {
          setSession(null);
          setUser(null);
          setProfile(null);
          profileLoadedRef.current = false;
        }
      }

      setLoading(false);
    };

    // Suscripción WebSockets Realtime para detectar cambios en el perfil (ej. desactivación o cambio de rol)
    let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;

    const setupProfileRealtime = (userId: string) => {
      if (realtimeChannel) {
        realtimeChannel.unsubscribe();
        realtimeChannel = null;
      }
      realtimeChannel = supabase
        .channel(`profile-status-${userId}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
          (payload) => {
            const updated = payload.new as any;
            if (updated.is_active === false) {
              console.warn('[AuthContext] Cuenta desactivada vía Realtime');
              supabase.auth.signOut();
            } else {
              console.log('[AuthContext] Cambio detectado en el perfil vía Realtime, actualizando...');
              refreshProfile();
            }
          }
        )
        .subscribe((status) => {
          console.log('[AuthContext] Realtime profile status:', status);
        });
    };

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log(`[AuthContext] ✅ getSession:`, {
        hasSession: !!session,
        expiresAt: session?.expires_at ? new Date(session.expires_at * 1000).toLocaleString() : 'N/A',
        onLine: navigator.onLine,
      });
      if (session?.user?.id) {
        setupProfileRealtime(session.user.id);
      }
      handleAuthChange('INITIAL_SESSION', session);
    }).catch((err) => {
      console.error('[AuthContext] ❌ getSession FALLÓ:', err.message);
      const cached = getCachedProfile();
      if (cached) {
        console.log('[AuthContext] ⚠️ getSession falló, usando perfil cacheado');
        handleAuthChange('INITIAL_SESSION', null);
      } else {
        setLoading(false);
      }
    });

    // Listen for ALL auth changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      logger.log(`[AuthContext] onAuthStateChange recibido: ${event}`);
      if (event === 'INITIAL_SESSION') {
        logger.log(`[AuthContext] Saltando INITIAL_SESSION (ya manejado)`);
        return;
      }
      // Auditoría de login: registrar SOLO en un login con credenciales real.
      // SIGNED_IN se redispara por reconexión/recarga/foco, NO solo al iniciar
      // sesión. Para distinguirlo usamos `last_sign_in_at` (que únicamente cambia
      // en un login genuino) como firma persistida en localStorage. Así el dedupe
      // sobrevive recargas de la webview (en memoria se perdía en móvil).
      if (event === 'SIGNED_IN' && session?.user?.id) {
        setupProfileRealtime(session.user.id);
        const uid = session.user.id;
        const signInAt = session.user.last_sign_in_at || null;
        const mark = `${uid}|${signInAt ?? ''}`;
        if (localStorage.getItem(SIGNIN_MARK_KEY) !== mark) {
          localStorage.setItem(SIGNIN_MARK_KEY, mark);
          loggedInUidRef.current = uid;
          // Método real (fijado por la función de login). Fallback al provider de
          // Supabase para sesiones restauradas o flujos sin método explícito.
          let pendingMethod: string | undefined;
          try { pendingMethod = localStorage.getItem(PENDING_AUTH_METHOD_KEY) || undefined; } catch { /* no-op */ }
          const provider = pendingMethod
            || (session.user.app_metadata?.provider as string | undefined)
            || undefined;
          // Best-effort, no bloquea el flujo de auth. La hora es la del sign-in real.
          markSignedIn(uid, signInAt);
          auditAuthEvent('login.success', { auth_provider: provider });
          try { localStorage.removeItem(PENDING_AUTH_METHOD_KEY); } catch { /* no-op */ }
        }
      }
      if (event === 'SIGNED_OUT') {
        loggedInUidRef.current = null;
        localStorage.removeItem(SIGNIN_MARK_KEY);
        if (realtimeChannel) {
          realtimeChannel.unsubscribe();
          realtimeChannel = null;
        }
      }
      handleAuthChange(event, session);
    });

    return () => {
      logger.log(`[AuthContext] Limpiando suscripción de auth`);
      subscription.unsubscribe();
      if (realtimeChannel) {
        realtimeChannel.unsubscribe();
        realtimeChannel = null;
      }
    };
  }, [fetchProfile]);


  const signIn = async (email: string, password: string) => {
    setPendingAuthMethod('email_password');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signUp = async (email: string, password: string, fullName: string, businessName: string, phone?: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          business_name: businessName,
          phone: phone || undefined
        }
      },
    });

    // Note: The database trigger 'handle_new_user()' automatically creates:
    // 1. A new business record with the provided business_name
    // 2. A profile record linked to that business
    // So we don't need to manually insert into profiles here

    return { data, error };
  };

  const signOut = async () => {
    logger.log(`[AuthContext] signOut llamado`);

    // Capturar el uid antes de limpiar el estado (para auditoría y is_signed_in).
    const uidForAudit = user?.id ?? currentUserIdRef.current ?? null;

    isFetchingProfileRef.current = false;
    currentUserIdRef.current = null;

    localStorage.removeItem(PROFILE_CACHE_KEY);
    localStorage.removeItem(SUBSCRIPTION_CACHE_KEY);

    setUser(null);
    setProfile(null);
    setSession(null);
    setHasActiveSubscription(null);
    setSubscription(null);
    setLoading(false);

    // Liberar el endpoint de push ANTES de invalidar la sesión.
    // release_push_subscription es SECURITY DEFINER pero su GRANT es a
    // authenticated; si esperamos al efecto de usePushSubscription, la sesión ya
    // fue revocada y la llamada se rechaza. Por eso se hace aquí, con sesión viva.
    //
    // IMPORTANTE: `navigator.serviceWorker.ready` NUNCA resuelve si no hay un SW
    // activo (caso dev: localhost y el túnel Cloudflare no registran SW). Sin la
    // guarda de `controller` + timeout, este await colgaba TODO el logout: no se
    // ejecutaba markSignedOut(), ni signOut(), ni el borrado de claves sb-*, así
    // que la sesión persistía tras refrescar. En producción el SW está activo y
    // resuelve normal.
    try {
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        const reg = await Promise.race([
          navigator.serviceWorker.ready,
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000)),
        ]);
        if (reg) {
          const sub = await reg.pushManager.getSubscription();
          if (sub) {
            await supabase.rpc('release_push_subscription', { p_endpoint: sub.endpoint });
          }
        }
      }
    } catch { /* best-effort */ }

    // Auditoría: marcar sesión cerrada y registrar logout ANTES de invalidar la sesión.
    if (uidForAudit) {
      await markSignedOut(uidForAudit);
      await auditAuthEvent('logout');
    }
    // Cerrar el canal de presencia singleton.
    try { presenceManager.stop(); } catch { /* no-op */ }

    try {
      if (firebaseAuth.currentUser) {
        await firebaseAuth.signOut();
      }
      await supabase.auth.signOut();
    } catch (err) {
      console.error(`[AuthContext] Error en signOut:`, err);
    }

    Object.keys(localStorage)
      .filter(k => k.startsWith('sb-'))
      .forEach(k => {
        localStorage.removeItem(k);
      });

    logger.log(`[AuthContext] signOut completado`);
  };


  const signInWithGoogle = async (): Promise<{ error: AuthError | null }> => {
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(firebaseAuth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const googleIdToken = credential?.idToken;
      if (!googleIdToken) {
        return { error: { message: 'No se pudo obtener el token de Google' } as AuthError };
      }
      setPendingAuthMethod('google_oauth');
      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: googleIdToken,
      });
      if (error) {
        console.error('[AuthContext] Error signInWithIdToken:', error);
        return { error };
      }
      return { error: null };
    } catch (err: any) {
      if (err.code === 'auth/popup-closed-by-user') {
        return { error: null };
      }
      console.error('[AuthContext] Google sign-in error:', err);
      return { error: { message: err.message } as AuthError };
    }
  };

  const confirmationResultRef = React.useRef<ConfirmationResult | null>(null);

  const setupRecaptcha = async () => {
    console.log('[PhoneAuth] Iniciando setupRecaptcha...');
    if ((window as any).recaptchaVerifier) {
      console.log('[PhoneAuth] Limpiando verifier anterior');
      try {
        (window as any).recaptchaVerifier.clear();
      } catch (_) { }
      (window as any).recaptchaVerifier = null;
    }
    console.log('[PhoneAuth] Creando nuevo RecaptchaVerifier...');
    const verifier = new RecaptchaVerifier(firebaseAuth, 'recaptcha-container', {
      size: 'invisible',
      callback: (token: string) => {
        console.log('[PhoneAuth] reCAPTCHA resuelto, token:', token?.substring(0, 20) + '...');
      },
      'expired-callback': () => {
        console.log('[PhoneAuth] reCAPTCHA token expirado');
      },
    });
    const widgetId = await verifier.render();
    console.log('[PhoneAuth] reCAPTCHA renderizado, widgetId:', widgetId);
    (window as any).recaptchaVerifier = verifier;
    return verifier;
  };

  const signInWithPhone = async (phone: string) => {
    console.log('[PhoneAuth] signInWithPhone llamado con:', phone);
    try {
      const appVerifier = await setupRecaptcha();
      console.log('[PhoneAuth] Llamando signInWithPhoneNumber...');
      const result = await signInWithPhoneNumber(firebaseAuth, phone, appVerifier);
      console.log('[PhoneAuth] SMS enviado exitosamente');
      confirmationResultRef.current = result;
      return { error: null };
    } catch (err: any) {
      console.error('[PhoneAuth] Error:', err.code, err.message);
      console.error('[PhoneAuth] Error completo:', JSON.stringify(err, null, 2));
      if ((window as any).recaptchaVerifier) {
        try { (window as any).recaptchaVerifier.clear(); } catch (_) { }
        (window as any).recaptchaVerifier = null;
      }
      return { error: { message: err.message || 'Error enviando SMS' } as any };
    }
  };

  const verifyOTP = async (_phone: string, token: string, mode: 'login' | 'register' = 'register') => {
    try {
      if (!confirmationResultRef.current) {
        return { error: { message: 'No hay verificaci├│n pendiente. Solicita un nuevo c├│digo.' } as any };
      }

      const credential = await confirmationResultRef.current.confirm(token);
      const firebaseToken = await credential.user.getIdToken();
      confirmationResultRef.current = null;

      console.log('[PhoneAuth] OTP verificado por Firebase, llamando Edge Function...');

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(`${supabaseUrl}/functions/v1/firebase-phone-auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firebaseToken, mode }),
      });

      const data = await res.json();
      console.log('[PhoneAuth] Respuesta Edge Function:', data);

      if (!res.ok || data.error) {
        return { error: { message: data.error || 'Error creando sesi├│n' } as any };
      }

      if (data.hashed_token) {
        setPendingAuthMethod('firebase_otp');
        const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({
          token_hash: data.hashed_token,
          type: 'magiclink',
        });
        if (verifyError) {
          console.error('[PhoneAuth] Error verificando token hash:', verifyError);
          return { error: verifyError };
        }

        console.log('[PhoneAuth] Sesi├│n Supabase creada:', !!verifyData.session);
      }

      return { error: null };
    } catch (err: any) {
      console.error('[PhoneAuth] Error en verifyOTP:', err);
      return { error: { message: err.message || 'C├│digo incorrecto' } as any };
    }
  };

  const userExistsByPhone = async (phone: string): Promise<boolean> => {
    try {
      const { data, error } = await supabase.rpc('user_exists_by_phone', { p_phone: phone });
      if (error) {
        console.error('[AuthContext] user_exists_by_phone error:', error);
        return false;
      }
      return data === true;
    } catch (e) {
      console.error('[AuthContext] user_exists_by_phone exception:', e);
      return false;
    }
  };

  const signInWithPin = async (phone: string, pin: string) => {
    // La cuenta puede tener correo real (Google) o el temporal @bistro.temp,
    // así que resolvemos el correo de login por teléfono vía RPC en vez de asumirlo.
    const { data: email, error: rpcError } = await supabase.rpc('login_email_for_phone', { p_phone: phone });
    if (rpcError || !email) {
      return { error: { message: 'user_not_found' } as any };
    }
    setPendingAuthMethod('pin');
    const { error } = await supabase.auth.signInWithPassword({ email, password: pin });
    return { error };
  };

  // Registro fase 1: confirma el OTP con Firebase SIN crear sesión Supabase todavía.
  const confirmFirebaseOtp = async (token: string) => {
    try {
      if (!confirmationResultRef.current) {
        return { error: { message: 'No hay verificación pendiente. Solicita un nuevo código.' } as any };
      }
      await confirmationResultRef.current.confirm(token);
      confirmationResultRef.current = null;
      return { error: null };
    } catch (err: any) {
      return { error: { message: err.message || 'Código incorrecto' } as any };
    }
  };

  // Registro fase 2: crea la cuenta con el PIN (vía edge function) y abre la sesión Supabase.
  const finishPhoneRegistration = async (pin: string) => {
    try {
      const fbUser = firebaseAuth.currentUser;
      if (!fbUser) {
        return { error: { message: 'La verificación expiró. Vuelve a empezar.' } as any };
      }
      const firebaseToken = await fbUser.getIdToken();
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(`${supabaseUrl}/functions/v1/firebase-phone-auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firebaseToken, mode: 'register', pin }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        return { error: { message: data.error || 'Error creando la cuenta' } as any };
      }
      if (data.hashed_token) {
        setPendingAuthMethod('firebase_otp');
        const { error: verifyError } = await supabase.auth.verifyOtp({
          token_hash: data.hashed_token,
          type: 'magiclink',
        });
        if (verifyError) return { error: verifyError };
      }
      return { error: null };
    } catch (err: any) {
      return { error: { message: err.message || 'Error creando la cuenta' } as any };
    }
  };

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}?type=recovery`,
    });
    return { error };
  };

  const updatePassword = async (newPassword: string) => {
    // El PIN se cambia vía edge function con API admin, que ignora la política de
    // longitud/fortaleza de Supabase (mínimo 6). Así el PIN sigue siendo de 4 dígitos
    // y el login por teléfono+PIN no cambia (se guarda el PIN tal cual).
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return { error: { message: 'No hay sesión activa' } as any };
    }
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(`${supabaseUrl}/functions/v1/change-pin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ pin: newPassword }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        return { error: { message: data.error || 'No se pudo cambiar el PIN' } as any };
      }
      return { error: null };
    } catch (err: any) {
      return { error: { message: err.message || 'No se pudo cambiar el PIN' } as any };
    }
  };

  const refreshProfile = async () => {
    if (user) {
      const userProfile = await fetchProfile(user.id, user.email || '');
      setProfile(userProfile);
    }
  };

  const checkSubscription = useCallback(async () => {
    logger.log(`[AuthContext] checkSubscription llamado, business_id:`, profile?.business_id);

    if (!profile?.business_id) {
      logger.log(`[AuthContext] No hay business_id, suscripci├│n = false`);
      setHasActiveSubscription(false);
      setSubscriptionEndDate(null);
      setSubscription(null);
      return;
    }

    try {
      // Traemos `*` para exponer la fila completa en el context (`subscription`)
      // y hacemos join con `subscription_plans` para que `useCustomPlan()` pueda
      // derivar `hasCustomPlan` desde `plan.assigned_business_id`.
      const { data, error } = await supabase
        .from('business_subscriptions')
        .select(`
          *,
          plan:subscription_plans (
            id,
            name,
            price_monthly,
            initial_period_months,
            assigned_business_id,
            features,
            is_active
          )
        `)
        .eq('business_id', profile.business_id)
        .maybeSingle();

      logger.log(`[AuthContext] Datos de suscripci├│n:`, { data, error });

      if (error) {
        console.error('[AuthContext] Error checking subscription:', error);
        const isNetworkError = error.message?.includes('fetch') || error.message?.toLowerCase().includes('network') || error.message?.includes('Failed to fetch');
        if (!navigator.onLine || isNetworkError) {
          const cached = getCachedSubscription();
          if (cached) {
            logger.log('[AuthContext] Usando suscripci├│n cacheada (Lie-Fi/offline)');
            setHasActiveSubscription(cached.hasActive);
            setSubscriptionEndDate(cached.endDate ? new Date(cached.endDate) : null);
            return;
          }
        }
        setHasActiveSubscription(false);
        setSubscriptionEndDate(null);
        setSubscription(null);
        return;
      }

      if (!data) {
        logger.log(`[AuthContext] No se encontr├│ suscripci├│n`);
        setHasActiveSubscription(false);
        setSubscriptionEndDate(null);
        setSubscription(null);
        return;
      }

      // Guardamos la fila completa (con el plan anidado) para consumidores como
      // `useCustomPlan()`. Casteamos porque el tipo devuelto por Supabase infiere
      // `plan` como array en algunos generadores; en este join siempre es objeto.
      setSubscription(data as unknown as Subscription);

      // Store the end date
      const endDate = new Date(data.current_period_end);
      setSubscriptionEndDate(endDate);

      // Check if subscription is active or in trial
      // Grace period: 48 hours after expiration the user still has access.
      // La gracia también aplica cuando el edge function marcó `past_due` al pasar
      // `next_billing_date` (sin tarjeta o cobro fallido), para no bloquear inmediatamente.
      // `canceled` no entra a gracia: es cancelación explícita.
      const now = new Date();
      const isActiveStatus = ['active', 'trial'].includes(data.status);
      const isPastDue = data.status === 'past_due';
      const notExpired = endDate > now;
      const hoursOverdue = (now.getTime() - endDate.getTime()) / (1000 * 60 * 60);
      const inGracePeriod = (isActiveStatus || isPastDue) && !notExpired && hoursOverdue <= 48;
      const hasActive = ((isActiveStatus || isPastDue) && notExpired) || inGracePeriod;

      cacheSubscription({ hasActive, endDate: data.current_period_end });

      // Detect brand new trial (created less than 2 minutes ago, only fire once)
      if (data.status === 'trial' && hasActive) {
        const startDate = new Date(data.current_period_start);
        const ageMs = Date.now() - startDate.getTime();
        const alreadyWelcomed = localStorage.getItem('bistro_trial_welcomed') === data.current_period_start;
        if (ageMs < 120000 && !alreadyWelcomed) {
          localStorage.setItem('bistro_trial_welcomed', data.current_period_start);
          setIsNewTrial(true);
        }
      }

      logger.log(`[AuthContext] Estado suscripci├│n:`, {
        status: data.status,
        current_period_end: data.current_period_end,
        isActiveStatus,
        isPastDue,
        notExpired,
        hoursOverdue,
        inGracePeriod,
        hasActiveSubscription: hasActive
      });

      setHasActiveSubscription(hasActive);
    } catch (err: any) {
      console.error('Exception checking subscription:', err);
      const isNetworkError = err.message?.includes('fetch') || err.message?.toLowerCase().includes('network') || err.message?.includes('Failed to fetch');
      if (!navigator.onLine || isNetworkError) {
        const cached = getCachedSubscription();
        if (cached) {
          logger.log('[AuthContext] Usando suscripci├│n cacheada (offline/Lie-Fi, tras error)');
          setHasActiveSubscription(cached.hasActive);
          setSubscriptionEndDate(cached.endDate ? new Date(cached.endDate) : null);
          return;
        }
      }
      setHasActiveSubscription(false);
      setSubscriptionEndDate(null);
      setSubscription(null);
    }
  }, [profile]);

  // Check subscription when profile loads
  useEffect(() => {
    if (profile) {
      checkSubscription();
    } else {
      setHasActiveSubscription(null);
      setSubscription(null);
    }
  }, [profile, checkSubscription]);

  return (
    <AuthContext.Provider value={{
      user, profile, session, loading,
      hasActiveSubscription,
      subscriptionEndDate,
      subscription,
      isNewTrial,
      clearNewTrialFlag: () => setIsNewTrial(false),
      signIn, signUp, signOut, signInWithGoogle,
      signInWithPhone, verifyOTP,
      userExistsByPhone, signInWithPin, confirmFirebaseOtp, finishPhoneRegistration,
      resetPassword, updatePassword, refreshProfile,
      checkSubscription,
    }}>
      {children}
    </AuthContext.Provider>
  );
};
