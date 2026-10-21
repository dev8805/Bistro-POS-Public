import React from 'react';
import { useSuppliers } from '../hooks/useSuppliers';
import { useDebts } from '../hooks/useDebts';

// Monta hooks globales cuyo único propósito es precargar el localStorage
// al iniciar sesión, sin esperar a que el usuario entre a la pantalla que
// los usa. Aísla los re-renders fuera del árbol de App.
export const DataPrefetcher: React.FC = () => {
    useSuppliers();
    useDebts();
    return null;
};
