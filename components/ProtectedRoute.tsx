import React from 'react';
import { useAuth } from '../context/AuthContext';
import { UserRole } from '../types';
import { AppLoader } from './AppLoader';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles }) => {
  const { user, profile, loading } = useAuth();

  if (loading) return <AppLoader />;

  // User is not authenticated - handled by App.tsx to show login
  if (!user) {
    return null;
  }

  // Check role-based access if allowedRoles is specified
  if (allowedRoles && allowedRoles.length > 0 && profile) {
    if (!allowedRoles.includes(profile.role)) {
      return (
        <div className="min-h-screen w-full flex items-center justify-center bg-[#f6f8f7] p-6">
          <div className="bg-white border border-gray-200 rounded-3xl p-10 shadow-lg text-center max-w-md">
            <div className="size-20 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <span className="material-symbols-outlined text-red-500 text-4xl">lock</span>
            </div>
            <h2 className="text-2xl font-semibold text-gray-800 mb-3">Acceso Restringido</h2>
            <p className="text-gray-500 mb-6">
              No tienes permisos para acceder a esta sección.
              <br />
              Contacta a un administrador si crees que esto es un error.
            </p>
            <p className="text-gray-400 text-sm">
              Tu rol actual: <span className="text-emerald-500 font-medium">{profile.role}</span>
            </p>
          </div>
        </div>
      );
    }
  }

  return <>{children}</>;
};
