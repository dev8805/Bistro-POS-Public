import '@testing-library/jest-dom';
import { afterEach, beforeEach } from 'vitest';
import { cleanup } from '@testing-library/react';

/**
 * Mock básico y reutilizable de localStorage para el entorno de pruebas.
 *
 * jsdom incluye una implementación de localStorage, pero este mock explícito
 * garantiza un estado limpio y predecible entre tests, y permite usar
 * `localStorage` de forma síncrona en módulos como `lib/printerRegistry.ts`.
 */
class LocalStorageMock implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) as string) : null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

// Exponer una instancia fresca de localStorage antes de cada test
beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    value: new LocalStorageMock(),
    writable: true,
    configurable: true,
  });
});

// Limpiar el DOM montado por Testing Library después de cada test
afterEach(() => {
  cleanup();
  globalThis.localStorage?.clear();
});
