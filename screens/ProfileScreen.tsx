import React, { useState, useRef, useEffect } from 'react';
import { Screen, UserRole } from '../types';
import { useAuth } from '../context/AuthContext';
import { useBusinessSettings } from '../hooks/useBusinessSettings';
import { supabase } from '../lib/supabase';
import { useImageUpload } from '../hooks/useImageUpload';
import { ImageCropper } from '../components/ImageCropper';
import { InAppCamera } from '../components/InAppCamera';
import { getRealEmail } from '../lib/formatters';

interface ProfileScreenProps {
    onNavigate: (screen: Screen) => void;
}

export const ProfileScreen: React.FC<ProfileScreenProps> = ({ onNavigate }) => {
    const { profile, user, refreshProfile, signOut, updatePassword } = useAuth();
    const { businessName, businessCode, refetch: refetchBusiness } = useBusinessSettings();
    const [codeCopied, setCodeCopied] = useState(false);
    const emailInputRef = useRef<HTMLInputElement>(null);

    const isProfileIncomplete = profile?.role === 'Administrador' &&
        (businessName === 'Mi Negocio' || businessName?.endsWith("'s Business"));

    const [formData, setFormData] = useState({
        full_name: profile?.full_name || '',
        phone: profile?.phone || '',
        email: getRealEmail(profile?.email || user?.email),
        business_name: businessName || '',
    });

    const [isLoading, setIsLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [showPinModal, setShowPinModal] = useState(false);
    const [newPin, setNewPin] = useState('');
    const [newPinConfirm, setNewPinConfirm] = useState('');
    const [savingPin, setSavingPin] = useState(false);
    const [pinError, setPinError] = useState<string | null>(null);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deleteConfirmText, setDeleteConfirmText] = useState('');
    const [isDeleting, setIsDeleting] = useState(false);
    const [isBusinessOwner, setIsBusinessOwner] = useState(false);
    const [showAvatarMenu, setShowAvatarMenu] = useState(false);
    const [showEmailInput, setShowEmailInput] = useState(false);
    const avatarMenuRef = useRef<HTMLDivElement>(null);

    const {
        imageUrl: avatarUrl,
        uploading: uploadingAvatar,
        statusText: avatarStatusText,
        handleImageSelect: handleAvatarSelect,
        handlePasteClick: handleAvatarPasteClick,
        previewUrl: updatedAvatarPreviewUrl,
        deleteImage: deleteAvatarImage,
        showCropper: showAvatarCropper,
        cropperImageSrc: avatarCropperImageSrc,
        onCropComplete: onAvatarCropComplete,
        onCropCancel: onAvatarCropCancel,
        triggerCamera: triggerAvatarCamera,
        showInAppCamera: showAvatarInAppCamera,
        onCameraCapture: onAvatarCameraCapture,
        onCameraClose: onAvatarCameraClose
    } = useImageUpload(profile?.avatar_url || null, 'avatars', user?.id || undefined);

    useEffect(() => {
        const checkOwnership = async () => {
            if (!user || !profile?.business_id) return;
            const { data } = await supabase
                .from('businesses')
                .select('owner_id')
                .eq('id', profile.business_id)
                .single();
            setIsBusinessOwner(data?.owner_id === user.id);
        };
        checkOwnership();
    }, [user, profile?.business_id]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (avatarMenuRef.current && !avatarMenuRef.current.contains(event.target as Node)) {
                setShowAvatarMenu(false);
            }
        };
        if (showAvatarMenu) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [showAvatarMenu]);

    const getInitials = (): string => {
        if (formData.full_name) {
            return formData.full_name
                .split(' ')
                .map(n => n[0])
                .join('')
                .substring(0, 2)
                .toUpperCase();
        }
        return 'U';
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;
        if (!navigator.onLine) {
            setMessage({ type: 'error', text: 'Necesitas conexión a internet para guardar cambios en tu perfil.' });
            return;
        }

        setIsLoading(true);
        setMessage(null);

        try {
            const { error: profileError } = await supabase
                .from('profiles')
                .update({
                    full_name: formData.full_name,
                    phone: formData.phone,
                    avatar_url: avatarUrl
                })
                .eq('id', user.id);

            if (profileError) throw new Error(`Error al guardar datos personales: ${profileError.message}`);

            if (profile?.role === 'Administrador' && profile?.business_id && formData.business_name) {
                const { error: bizError } = await supabase
                    .from('businesses')
                    .update({ name: formData.business_name })
                    .eq('id', profile.business_id);
                if (bizError) throw new Error(`Datos personales guardados, pero falló el nombre del negocio: ${bizError.message}`);
                await refetchBusiness();
            }

            if (formData.email && formData.email !== getRealEmail(user.email)) {
                const { data: emailAvailable, error: checkError } = await supabase.rpc('is_email_available', {
                    p_email: formData.email,
                });
                if (checkError) throw new Error(`No se pudo verificar el correo: ${checkError.message}`);
                if (!emailAvailable) throw new Error('Este correo ya está registrado en otra cuenta. Usa uno diferente.');

                // El cambio de correo se hace server-side vía la edge function `update-email`
                // (API admin). Autentica al usuario por su token con getUser(), así que NO
                // depende de que la sesión siga viva en el servidor —a diferencia de
                // supabase.auth.updateUser, que fallaba con "session_not_found" por el token
                // desincronizado del flujo híbrido (Firebase + PIN + Google).
                const { data: result, error: fnError } = await supabase.functions.invoke('update-email', {
                    body: { email: formData.email },
                });
                const fnDetail = (result as { error?: string } | null)?.error;
                if (fnError || fnDetail) {
                    throw new Error(`Perfil guardado, pero falló la actualización del correo: ${fnDetail || fnError?.message || 'Error desconocido'}`);
                }

                // El correo ya cambió en el servidor. Refrescamos la sesión (best-effort)
                // para que el token y el correo mostrado queden al día; aunque falle, el
                // cambio ya se aplicó.
                try { await supabase.auth.refreshSession(); } catch { /* no-op */ }
                await refreshProfile();
                setShowEmailInput(false);
                setMessage({ type: 'success', text: `Correo actualizado a ${formData.email}. Ya puedes usarlo para iniciar sesión.` });
            } else {
                await refreshProfile();
                setMessage({ type: 'success', text: '¡Perfil actualizado correctamente!' });
            }
        } catch (error: any) {
            console.error('Error updating profile:', error);
            setMessage({ type: 'error', text: error.message || 'Error al actualizar el perfil.' });
        } finally {
            setIsLoading(false);
        }
    };

    const getRoleBadgeColor = (role: UserRole): string => {
        switch (role) {
            case 'Administrador':
                return 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300';
            case 'Cajero':
                return 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300';
            case 'Mesero':
                return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300';
            case 'Cocinero':
                return 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300';
            default:
                return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleCopyBusinessCode = () => {
        if (!businessCode) return;
        navigator.clipboard?.writeText(businessCode)
            .then(() => {
                setCodeCopied(true);
                setTimeout(() => setCodeCopied(false), 2000);
            })
            .catch(() => { /* clipboard no disponible, silencioso */ });
    };

    const handleOpenPinModal = () => {
        setNewPin('');
        setNewPinConfirm('');
        setPinError(null);
        setShowPinModal(true);
    };

    const handleClosePinModal = () => {
        setShowPinModal(false);
        setNewPin('');
        setNewPinConfirm('');
        setPinError(null);
    };

    const handleSavePin = async () => {
        setPinError(null);
        if (newPin.length !== 4) { setPinError('El PIN debe tener 4 dígitos'); return; }
        if (newPin !== newPinConfirm) { setPinError('Los PIN no coinciden'); return; }
        setSavingPin(true);
        const { error } = await updatePassword(newPin);
        setSavingPin(false);
        if (error) {
            setPinError(error.message || 'No se pudo cambiar el PIN. Intenta de nuevo.');
            return;
        }
        setMessage({ type: 'success', text: 'PIN actualizado correctamente' });
        handleClosePinModal();
    };

    const hasChanges =
        formData.full_name !== (profile?.full_name || '') ||
        formData.phone !== (profile?.phone || '') ||
        formData.email !== getRealEmail(profile?.email || user?.email) ||
        formData.business_name !== (businessName || '') ||
        avatarUrl !== (profile?.avatar_url || null);

    const realEmail = getRealEmail(user?.email);

    return (
        <main className="flex-1 h-full overflow-hidden flex flex-col bg-gray-50 dark:bg-gray-900/30 animate-fadeIn">
            {/* Header */}
            <header className="flex-shrink-0 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-background-dark px-4 md:px-8 py-5">
                <div className="flex items-center gap-4 max-w-3xl mx-auto w-full">
                    <button
                        onClick={() => onNavigate(Screen.DASHBOARD)}
                        className="hidden p-1.5 rounded-lg text-text-secondary hover:text-text-main hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors md:hidden"
                    >
                        <span className="material-symbols-outlined text-gray-500">arrow_back</span>
                    </button>
                    <div>
                        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white tracking-tight">Ajustes</h1>
                        <p className="text-sm text-gray-500 mt-0.5">Administra tu perfil y preferencias</p>
                    </div>
                </div>
            </header>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-4 py-6 md:px-8 md:py-8">
                <div className="max-w-3xl mx-auto flex flex-col gap-5">
                    {/* Avisos */}
                    {isProfileIncomplete && (
                        <div className="p-4 rounded-xl flex items-start sm:items-center gap-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 shadow-sm animate-[fadeIn_0.2s_ease-out]">
                            <span className="material-symbols-outlined text-amber-500 mt-0.5 sm:mt-0">waving_hand</span>
                            <div className="flex-1">
                                <p className="text-sm font-semibold text-amber-800 dark:text-amber-400">
                                    ¡Bienvenido! Completa tu perfil
                                </p>
                                <p className="text-sm text-amber-700 dark:text-amber-500 mt-0.5">
                                    Ingresa el nombre de tu negocio y tus datos para comenzar.
                                </p>
                            </div>
                        </div>
                    )}

                    {message && (
                        <div className={`p-4 rounded-xl flex items-center gap-3 shadow-sm animate-[fadeIn_0.2s_ease-out] border ${message.type === 'success'
                            ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800'
                            : 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800'
                            }`}>
                            <span className={`material-symbols-outlined ${message.type === 'success' ? 'text-emerald-500' : 'text-red-500'}`}>
                                {message.type === 'success' ? 'check_circle' : 'error'}
                            </span>
                            <p className={`text-sm font-medium ${message.type === 'success' ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}>
                                {message.text}
                            </p>
                        </div>
                    )}

                    {/* HEADER DE PERFIL — avatar + nombre + rol + email + ID negocio + badge PIN */}
                    <div className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-gray-800 rounded-2xl shadow-sm overflow-hidden animate-cardEntry">
                        <div className="px-4 py-4 sm:px-7 sm:py-6 flex flex-row items-center gap-3 sm:gap-5">
                            {/* Avatar */}
                            <div className="relative shrink-0" ref={avatarMenuRef}>
                                <button
                                    type="button"
                                    onClick={() => setShowAvatarMenu(!showAvatarMenu)}
                                    className="relative size-14 sm:size-20 rounded-full overflow-hidden border border-gray-200 dark:border-gray-700 shadow-sm bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white font-bold text-lg sm:text-2xl group transition-transform hover:scale-105"
                                >
                                    {updatedAvatarPreviewUrl ? (
                                        <img src={updatedAvatarPreviewUrl} alt="Avatar" className="w-full h-full object-cover" />
                                    ) : (
                                        getInitials()
                                    )}

                                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[2px]">
                                        {uploadingAvatar ? (
                                            <div className="flex flex-col items-center justify-center">
                                                <div className="size-5 border-2 border-white border-t-transparent rounded-full animate-spin mb-1"></div>
                                                {avatarStatusText && <span className="text-white text-[9px] font-medium text-center px-1 leading-tight">{avatarStatusText}</span>}
                                            </div>
                                        ) : (
                                            <span className="material-symbols-outlined text-white text-xl sm:text-2xl">photo_camera</span>
                                        )}
                                    </div>
                                </button>

                                <span className="absolute bottom-0.5 right-0.5 sm:bottom-1 sm:right-1 size-3 sm:size-3.5 bg-emerald-500 border-2 border-white dark:border-gray-800 rounded-full z-10 pointer-events-none ring-1 ring-black/5"></span>

                                {showAvatarMenu && (
                                    <div className="absolute top-full left-0 mt-3 w-56 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 py-1.5 z-50 animate-[fadeIn_0.15s_ease-out]">
                                        <label className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-200 transition-colors">
                                            <span className="material-symbols-outlined text-[18px] text-gray-400">upload_file</span>
                                            Subir foto
                                            <input type="file" className="hidden" accept="image/*" onChange={(e) => { handleAvatarSelect(e); setShowAvatarMenu(false); }} />
                                        </label>
                                        <button
                                            type="button"
                                            onClick={() => { triggerAvatarCamera(); setShowAvatarMenu(false); }}
                                            className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 text-left text-sm font-medium text-gray-700 dark:text-gray-200 transition-colors"
                                        >
                                            <span className="material-symbols-outlined text-[18px] text-gray-400">photo_camera</span>
                                            Tomar foto
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => { handleAvatarPasteClick(); setShowAvatarMenu(false); }}
                                            className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 text-left text-sm font-medium text-gray-700 dark:text-gray-200 transition-colors"
                                        >
                                            <span className="material-symbols-outlined text-[18px] text-gray-400">content_paste</span>
                                            Pegar foto
                                        </button>
                                        {updatedAvatarPreviewUrl && !uploadingAvatar && (
                                            <>
                                                <div className="h-px bg-gray-100 dark:bg-gray-700 my-1.5"></div>
                                                <button
                                                    type="button"
                                                    onClick={() => { deleteAvatarImage(); setShowAvatarMenu(false); }}
                                                    className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-red-50 dark:hover:bg-red-900/20 text-left text-sm font-medium text-red-600 dark:text-red-400 transition-colors"
                                                >
                                                    <span className="material-symbols-outlined text-[18px] text-red-500">delete</span>
                                                    Eliminar foto
                                                </button>
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Datos */}
                            <div className="flex-1 min-w-0 text-left flex flex-col gap-1 sm:gap-1.5">
                                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                                    <h2 className="text-base sm:text-xl font-semibold text-gray-900 dark:text-white truncate">
                                        {formData.full_name || 'Sin nombre'}
                                    </h2>
                                    <span className={`self-start inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${getRoleBadgeColor(profile?.role || 'Mesero')}`}>
                                        {profile?.role || 'Mesero'}
                                    </span>
                                </div>

                                {realEmail && (
                                    <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 truncate">
                                        {realEmail}
                                    </p>
                                )}

                                {businessCode && (
                                    <button
                                        type="button"
                                        onClick={handleCopyBusinessCode}
                                        className="self-start inline-flex items-center gap-1.5 mt-0.5 px-2 py-1 rounded-md bg-gray-100 dark:bg-gray-800/60 hover:bg-gray-200 dark:hover:bg-gray-700/60 transition-colors group"
                                        title="Copiar ID del negocio"
                                        aria-label={`Copiar ID del negocio ${businessCode}`}
                                    >
                                        <span className="text-[11px] font-bold font-mono tracking-wider text-gray-600 dark:text-gray-300">#{businessCode}</span>
                                        <span className="material-symbols-outlined text-[13px] text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300">
                                            {codeCopied ? 'check' : 'content_copy'}
                                        </span>
                                        {codeCopied && <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">Copiado</span>}
                                    </button>
                                )}
                            </div>

                            {/* Badge: Cambiar PIN (lado derecho, alineado arriba) */}
                            <button
                                type="button"
                                onClick={handleOpenPinModal}
                                className="shrink-0 self-start inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-gray-50 hover:bg-gray-100 dark:bg-gray-800/80 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 text-[11px] sm:text-xs font-semibold text-gray-700 dark:text-gray-200 transition-colors shadow-sm"
                                aria-label="Cambiar PIN de acceso"
                            >
                                <span className="material-symbols-outlined text-[14px]">lock</span>
                                Cambiar PIN
                            </button>
                        </div>
                    </div>

                    {/* TARJETA: INFORMACIÓN PERSONAL */}
                    <div className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-gray-800 rounded-2xl shadow-sm overflow-hidden animate-cardEntry" style={{ animationDelay: '60ms' }}>
                        <div className="px-5 py-3.5 md:px-7 border-b border-gray-100 dark:border-gray-800/60">
                            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Información personal</h3>
                        </div>

                        <form onSubmit={handleSubmit} className="divide-y divide-gray-100 dark:divide-gray-800/60">

                            {/* Negocio */}
                            {profile?.role === 'Administrador' && (
                                <div className="px-5 py-3.5 md:px-7 flex flex-col max-sm:gap-1.5 sm:grid sm:grid-cols-3 sm:items-center hover:bg-gray-50/40 dark:hover:bg-white/[0.02] transition-colors">
                                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 sm:col-span-1 w-full">
                                        Negocio
                                    </label>
                                    <div className="w-full sm:col-span-2">
                                        <input
                                            type="text"
                                            name="business_name"
                                            value={formData.business_name}
                                            onChange={handleInputChange}
                                            placeholder="Ej: Restaurante El Buen Sabor"
                                            className={`w-full max-w-md px-3 py-2 text-sm rounded-lg border bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all ${isProfileIncomplete ? 'border-amber-400 dark:border-amber-600 ring-2 ring-amber-200 dark:ring-amber-800' : 'border-gray-200 dark:border-gray-700'}`}
                                            autoFocus={isProfileIncomplete}
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Nombre */}
                            <div className="px-5 py-3.5 md:px-7 flex flex-col max-sm:gap-1.5 sm:grid sm:grid-cols-3 sm:items-center hover:bg-gray-50/40 dark:hover:bg-white/[0.02] transition-colors">
                                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 sm:col-span-1 w-full">
                                    Nombre completo
                                </label>
                                <div className="w-full sm:col-span-2">
                                    <input
                                        type="text"
                                        name="full_name"
                                        value={formData.full_name}
                                        onChange={handleInputChange}
                                        placeholder="Tu nombre completo"
                                        className="w-full max-w-md px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                                    />
                                </div>
                            </div>

                            {/* Correo Electrónico — 3 estados */}
                            <div className="px-5 py-3.5 md:px-7 flex flex-col max-sm:gap-1.5 sm:grid sm:grid-cols-3 sm:items-center hover:bg-gray-50/40 dark:hover:bg-white/[0.02] transition-colors">
                                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 sm:col-span-1 w-full">
                                    Correo
                                </label>
                                <div className="w-full sm:col-span-2">
                                    {realEmail && !showEmailInput ? (
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="inline-flex items-center gap-1.5 text-sm text-gray-900 dark:text-white">
                                                <span className="material-symbols-outlined text-[16px] text-emerald-500">verified</span>
                                                {realEmail}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setShowEmailInput(true);
                                                    setFormData(prev => ({ ...prev, email: '' }));
                                                    setTimeout(() => emailInputRef.current?.focus(), 50);
                                                }}
                                                className="text-xs font-semibold text-blue-600 dark:text-blue-400 underline underline-offset-2 hover:text-blue-800 dark:hover:text-blue-300 transition-colors"
                                            >
                                                Cambiar
                                            </button>
                                        </div>
                                    ) : (
                                        <>
                                            <input
                                                ref={emailInputRef}
                                                type="email"
                                                name="email"
                                                value={formData.email}
                                                onChange={handleInputChange}
                                                placeholder="Escribe tu correo para vincularlo"
                                                className="w-full max-w-md px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                                                autoFocus={!realEmail}
                                            />
                                            {formData.email && formData.email !== realEmail && (
                                                <p className="mt-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                                                    <span className="material-symbols-outlined text-[14px] text-amber-500">info</span>
                                                    Al guardar se enviará un enlace de verificación
                                                </p>
                                            )}
                                            {!realEmail && !formData.email && (
                                                <p className="mt-1.5 text-xs text-gray-400 dark:text-gray-500">
                                                    Vincula un correo para recuperar tu cuenta
                                                </p>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* Teléfono */}
                            <div className="px-5 py-3.5 md:px-7 flex flex-col max-sm:gap-1.5 sm:grid sm:grid-cols-3 sm:items-center hover:bg-gray-50/40 dark:hover:bg-white/[0.02] transition-colors">
                                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 sm:col-span-1 w-full">
                                    Teléfono
                                </label>
                                <div className="w-full sm:col-span-2">
                                    <input
                                        type="tel"
                                        name="phone"
                                        value={formData.phone}
                                        onChange={handleInputChange}
                                        placeholder="Opcional"
                                        className="w-full max-w-md px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                                    />
                                </div>
                            </div>

                            {/* Footer Submit */}
                            <div className="px-5 py-3.5 md:px-7 bg-gray-50/50 dark:bg-gray-900/10 flex flex-col-reverse sm:flex-row items-center justify-end gap-2.5">
                                <button
                                    type="button"
                                    onClick={() => onNavigate(Screen.DASHBOARD)}
                                    className="w-full sm:w-auto px-4 py-2 text-sm font-semibold text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={isLoading || !hasChanges}
                                    className="w-full sm:w-auto px-5 py-2 bg-gray-900 dark:bg-white hover:bg-black dark:hover:bg-gray-100 text-white dark:text-gray-900 text-sm font-semibold rounded-lg shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    {isLoading ? (
                                        <>
                                            <div className="size-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                            Guardando...
                                        </>
                                    ) : (
                                        formData.email && formData.email !== realEmail ? 'Verificar' : 'Guardar cambios'
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>

                    {/* DANGER ZONE */}
                    {isBusinessOwner && (
                        <div className="bg-white dark:bg-surface-dark border-l-4 border-l-red-500 border-y border-r border-gray-200 dark:border-gray-800 rounded-2xl shadow-sm overflow-hidden mt-2 mb-4 animate-cardEntry" style={{ animationDelay: '180ms' }}>
                            <div className="p-5 md:px-7 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                                <div>
                                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                                        <span className="material-symbols-outlined text-[18px] text-red-500">warning</span>
                                        Zona peligrosa
                                    </h3>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-lg">
                                        Eliminarás permanentemente tu negocio, inventario, registros, empleados y todo acceso. Esta acción no se puede deshacer.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setShowDeleteModal(true)}
                                    className="shrink-0 px-4 py-2 text-sm font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/10 hover:bg-red-100 dark:hover:bg-red-900/30 border border-red-200 dark:border-red-800/30 rounded-lg transition-colors flex items-center gap-1.5"
                                >
                                    <span className="material-symbols-outlined text-[16px]">delete_forever</span>
                                    Eliminar cuenta
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* MODAL: CAMBIAR PIN */}
            {showPinModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-[fadeIn_0.2s_ease-out]">
                    <div className="bg-white dark:bg-surface-dark rounded-2xl border border-gray-200 dark:border-gray-800 shadow-2xl max-w-sm w-full p-6 animate-[slideInUp_0.3s_ease-out]">
                        <div className="flex items-start justify-between mb-5">
                            <div className="flex items-center gap-3">
                                <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center">
                                    <span className="material-symbols-outlined text-primary">lock</span>
                                </div>
                                <div>
                                    <h3 className="text-base font-semibold text-gray-900 dark:text-white">Cambiar PIN</h3>
                                    <p className="text-xs text-gray-500">PIN de 4 dígitos</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={handleClosePinModal}
                                className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                                aria-label="Cerrar"
                            >
                                <span className="material-symbols-outlined text-[20px]">close</span>
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                                    Nuevo PIN
                                </label>
                                <input
                                    type="password"
                                    inputMode="numeric"
                                    maxLength={4}
                                    value={newPin}
                                    onChange={(e) => { setNewPin(e.target.value.replace(/\D/g, '')); setPinError(null); }}
                                    placeholder="••••"
                                    className="w-full h-11 px-4 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white text-center text-lg tracking-[0.5em] focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none transition-all"
                                    autoFocus
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                                    Confirmar PIN
                                </label>
                                <input
                                    type="password"
                                    inputMode="numeric"
                                    maxLength={4}
                                    value={newPinConfirm}
                                    onChange={(e) => { setNewPinConfirm(e.target.value.replace(/\D/g, '')); setPinError(null); }}
                                    placeholder="••••"
                                    className="w-full h-11 px-4 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white text-center text-lg tracking-[0.5em] focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none transition-all"
                                />
                            </div>

                            {pinError && (
                                <div className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 flex items-center gap-2">
                                    <span className="material-symbols-outlined text-[16px] text-red-500">error</span>
                                    <p className="text-xs font-medium text-red-700 dark:text-red-400">{pinError}</p>
                                </div>
                            )}
                        </div>

                        <div className="flex gap-2.5 mt-6">
                            <button
                                type="button"
                                onClick={handleClosePinModal}
                                disabled={savingPin}
                                className="flex-1 py-2.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-semibold text-sm rounded-xl transition-all disabled:opacity-50"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={handleSavePin}
                                disabled={savingPin || newPin.length !== 4 || newPinConfirm.length !== 4}
                                className="flex-1 py-2.5 bg-primary hover:bg-primary-hover text-gray-900 font-semibold text-sm rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {savingPin ? (
                                    <>
                                        <div className="size-4 border-2 border-gray-900/60 border-t-gray-900 rounded-full animate-spin" />
                                        Guardando
                                    </>
                                ) : 'Guardar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL: ELIMINAR CUENTA */}
            {showDeleteModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-[fadeIn_0.2s_ease-out]">
                    <div className="bg-white dark:bg-surface-dark rounded-2xl border border-gray-200 dark:border-gray-800 shadow-2xl max-w-md w-full p-6 sm:p-8 animate-[slideInUp_0.3s_ease-out]">
                        <div className="flex items-center gap-4 mb-5">
                            <div className="size-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center shrink-0">
                                <span className="material-symbols-outlined text-red-600 text-2xl">warning</span>
                            </div>
                            <div>
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Eliminar cuenta</h3>
                                <p className="text-sm text-gray-500">Esta acción no se puede deshacer</p>
                            </div>
                        </div>

                        <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/30 rounded-xl p-4 mb-5">
                            <p className="text-sm text-red-700 dark:text-red-400 font-semibold mb-2">
                                Se eliminarán permanentemente:
                            </p>
                            <ul className="text-sm text-red-600 dark:text-red-500 space-y-1.5 list-disc list-inside">
                                <li>Tu negocio y configuración</li>
                                <li>Productos e inventario</li>
                                <li>Ventas y registros de caja</li>
                                <li>Empleados y cuentas</li>
                            </ul>
                        </div>

                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Escribe <strong className="text-red-600 bg-red-50 dark:bg-red-900/30 px-1.5 py-0.5 rounded">ELIMINAR</strong> para confirmar:
                        </label>
                        <input
                            type="text"
                            value={deleteConfirmText}
                            onChange={(e) => setDeleteConfirmText(e.target.value)}
                            placeholder="ELIMINAR"
                            className="w-full px-4 py-2.5 text-sm rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-red-500/50 focus:border-red-500 transition-all mb-6"
                            autoFocus
                        />

                        <div className="flex flex-col-reverse sm:flex-row gap-3">
                            <button
                                type="button"
                                onClick={() => { setShowDeleteModal(false); setDeleteConfirmText(''); }}
                                disabled={isDeleting}
                                className="w-full py-2.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-semibold text-sm rounded-xl transition-all"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                disabled={deleteConfirmText !== 'ELIMINAR' || isDeleting}
                                onClick={async () => {
                                    if (!profile?.business_id) return;
                                    setIsDeleting(true);
                                    try {
                                        const bizId = profile.business_id;

                                        const { data: employees } = await supabase
                                            .from('profiles')
                                            .select('id')
                                            .eq('business_id', bizId);

                                        const cleanBucket = async (bucket: string, folder: string) => {
                                            const { data: files } = await supabase.storage
                                                .from(bucket)
                                                .list(folder, { limit: 1000 });
                                            if (files && files.length > 0) {
                                                const paths = files.map(f => `${folder}/${f.name}`);
                                                await supabase.storage.from(bucket).remove(paths);
                                            }
                                        };

                                        await cleanBucket('product-images', bizId);
                                        await cleanBucket('business-logos', bizId);

                                        if (employees) {
                                            for (const emp of employees) {
                                                await cleanBucket('avatars', emp.id);
                                            }
                                        }

                                        const { error } = await supabase.rpc('delete_business_account', {
                                            target_business_id: bizId
                                        });
                                        if (error) throw error;
                                        await signOut();
                                    } catch (err: any) {
                                        console.error('Error deleting account:', err);
                                        setMessage({ type: 'error', text: err.message || 'Error al eliminar la cuenta.' });
                                        setIsDeleting(false);
                                        setShowDeleteModal(false);
                                        setDeleteConfirmText('');
                                    }
                                }}
                                className="w-full py-2.5 bg-red-600 hover:bg-red-700 disabled:bg-red-400 dark:disabled:bg-red-900/50 text-white font-semibold text-sm rounded-xl transition-all disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {isDeleting ? (
                                    <>
                                        <div className="size-4 border-2 border-white/60 border-t-white rounded-full animate-spin" />
                                        Eliminando...
                                    </>
                                ) : (
                                    <>
                                        Eliminar todo
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showAvatarCropper && avatarCropperImageSrc && (
                <ImageCropper
                    imageSrc={avatarCropperImageSrc}
                    onCropComplete={onAvatarCropComplete}
                    onCancel={onAvatarCropCancel}
                    aspectRatio={1}
                />
            )}

            {showAvatarInAppCamera && (
                <InAppCamera onCapture={onAvatarCameraCapture} onClose={onAvatarCameraClose} />
            )}
        </main>
    );
};
