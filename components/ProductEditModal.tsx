
import React, { useState, useEffect, useRef } from 'react';
import { Product } from '../types';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { AppButton } from './ui/AppButton';
import { flattenOptions } from '../lib/optionFolders';

interface ProductEditModalProps {
  product: Product;
  onClose: () => void;
  onSave: (product: Product) => Promise<void> | void;
}

interface ProductSuggestion {
  id: string;
  name: string;
  type: string;
  is_for_sale: boolean;
}

export const ProductEditModal: React.FC<ProductEditModalProps> = ({ product, onClose, onSave }) => {
  const { profile } = useAuth();
  const [hasCustomization, setHasCustomization] = useState(product.hasCustomization ?? false);
  const [ingredients, setIngredients] = useState<string[]>(product.ingredients || []);
  // NOTA: este modal es código muerto (nada llama a setEditingProduct). Se aplana solo para
  // satisfacer el tipo; NO edita carpetas. El flujo real de edición usa ProductOptionsModal.
  const [options, setOptions] = useState<string[]>(flattenOptions(product.customizableOptions));
  const [isSaving, setIsSaving] = useState(false);

  const [newIngredient, setNewIngredient] = useState('');
  const [newOption, setNewOption] = useState('');

  // Autocomplete state
  const [suggestions, setSuggestions] = useState<ProductSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Search products as user types
  useEffect(() => {
    const searchProducts = async () => {
      if (newIngredient.trim().length < 2) {
        setSuggestions([]);
        setShowSuggestions(false);
        return;
      }

      setLoadingSuggestions(true);
      try {
        const { data, error } = await supabase
          .from('products')
          .select('id, name, type, is_for_sale')
          .eq('business_id', profile?.business_id)
          .eq('is_active', true)
          .ilike('name', `%${newIngredient.trim()}%`)
          .limit(10);

        if (!error && data) {
          // Filter out already added ingredients
          const filtered = data.filter((p: ProductSuggestion) =>
            !ingredients.includes(p.name)
          );
          setSuggestions(filtered);
          setShowSuggestions(filtered.length > 0);
        }
      } catch (err) {
        console.error('Error searching products:', err);
      } finally {
        setLoadingSuggestions(false);
      }
    };

    const debounce = setTimeout(searchProducts, 300);
    return () => clearTimeout(debounce);
  }, [newIngredient, profile?.business_id, ingredients]);

  // Close suggestions on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave({
        ...product,
        hasCustomization,
        ingredients,
        customizableOptions: options,
      });
      onClose();
    } catch (error) {
      console.error('Error saving product options:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const addIngredient = (name?: string) => {
    const ingredientName = name || newIngredient.trim();
    if (ingredientName && !ingredients.includes(ingredientName)) {
      setIngredients([...ingredients, ingredientName]);
      setNewIngredient('');
      setShowSuggestions(false);
      setSuggestions([]);
    }
  };

  const selectSuggestion = (suggestion: ProductSuggestion) => {
    addIngredient(suggestion.name);
    inputRef.current?.focus();
  };

  const removeIngredient = (index: number) => {
    setIngredients(ingredients.filter((_, i) => i !== index));
  };

  const addOption = () => {
    if (newOption.trim()) {
      setOptions([...options, newOption.trim()]);
      setNewOption('');
    }
  };

  const removeOption = (index: number) => {
    setOptions(options.filter((_, i) => i !== index));
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 animate-[fadeIn_0.2s_ease-out]">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" role="button" tabIndex={-1} onClick={onClose} onKeyDown={(e) => e.key === 'Escape' && onClose()} aria-label="Cerrar"></div>

      <div className="relative w-full max-w-md bg-background-light dark:bg-background-dark rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center bg-surface-light dark:bg-surface-dark">
          <h2 className="text-lg font-semibold text-text-main dark:text-white flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">tune</span>
            Configurar Producto
          </h2>
          <button onClick={onClose} className="text-text-secondary hover:text-text-main transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 custom-scrollbar bg-surface-light dark:bg-surface-dark">

          {/* Main Toggle */}
          <div className="flex items-center justify-between mb-8 bg-gray-50 dark:bg-gray-800/50 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
            <div>
              <h3 className="font-semibold text-text-main dark:text-white">Desglose / Personalización</h3>
              <p className="text-xs text-text-secondary mt-1">Habilitar modal de selección al ordenar</p>
            </div>
            <button
              onClick={() => setHasCustomization(!hasCustomization)}
              className={`relative w-12 h-7 rounded-full transition-colors duration-300 ${hasCustomization ? 'bg-primary' : 'bg-gray-300 dark:bg-gray-600'}`}
            >
              <span className={`absolute top-1 left-1 bg-white size-5 rounded-full shadow-sm transition-transform duration-300 ${hasCustomization ? 'translate-x-5' : 'translate-x-0'}`}></span>
            </button>
          </div>

          {/* Configuration Sections - Only if customization is enabled */}
          {hasCustomization && (
            <div className="space-y-6">

              {/* Ingredients */}
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wider text-text-secondary mb-3 flex items-center gap-2">
                  <span className="material-symbols-outlined text-[16px]">format_list_bulleted</span>
                  Ingredientes (Desglose)
                </h3>
                <div className="space-y-2 mb-3">
                  {ingredients.map((ing, idx) => (
                    <div key={ing} className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800/30 p-2 rounded-lg border border-gray-100 dark:border-gray-800">
                      <span className="flex-1 text-sm font-medium text-text-main dark:text-white">{ing}</span>
                      <button onClick={() => removeIngredient(idx)} className="text-red-400 hover:text-red-500 p-1">
                        <span className="material-symbols-outlined text-[18px]">delete</span>
                      </button>
                    </div>
                  ))}
                  {ingredients.length === 0 && <p className="text-xs text-text-secondary italic p-2">Sin ingredientes definidos.</p>}
                </div>

                {/* Input with autocomplete */}
                <div className="relative">
                  <div className="flex gap-2">
                    <input
                      ref={inputRef}
                      type="text"
                      value={newIngredient}
                      onChange={(e) => setNewIngredient(e.target.value)}
                      onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                      placeholder="Buscar producto o insumo..."
                      className="flex-1 bg-white dark:bg-black/20 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          if (suggestions.length > 0) {
                            selectSuggestion(suggestions[0]);
                          }
                        }
                      }}
                    />
                    <button
                      onClick={() => addIngredient()}
                      className="bg-gray-200 dark:bg-gray-700 text-text-main dark:text-white px-3 py-2 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 font-bold text-sm"
                      disabled={!newIngredient.trim()}
                    >
                      <span className="material-symbols-outlined">add</span>
                    </button>
                  </div>

                  {/* Suggestions Dropdown */}
                  {showSuggestions && (
                    <div
                      ref={suggestionsRef}
                      className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl max-h-48 overflow-y-auto"
                    >
                      {loadingSuggestions ? (
                        <div className="p-3 text-center text-text-secondary text-sm flex items-center justify-center gap-2">
                          <div className="size-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                          Buscando...
                        </div>
                      ) : (
                        suggestions.map((suggestion) => (
                          <button
                            key={suggestion.id}
                            onClick={() => selectSuggestion(suggestion)}
                            className="w-full px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-2 border-b border-gray-100 dark:border-gray-800 last:border-0 transition-colors"
                          >
                            <span className="material-symbols-outlined text-[16px] text-text-secondary">
                              {suggestion.is_for_sale ? 'inventory_2' : 'package_2'}
                            </span>
                            <span className="flex-1 text-sm font-medium text-text-main dark:text-white">{suggestion.name}</span>
                            <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${suggestion.is_for_sale
                              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                              : 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
                              }`}>
                              {suggestion.is_for_sale ? 'Producto' : 'Ingrediente'}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
                <p className="text-[10px] text-text-secondary mt-1.5">Escribe para buscar productos e ingredientes de la base de datos</p>
              </div>

              {/* Options (Cooking Terms, etc) */}
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wider text-text-secondary mb-3 flex items-center gap-2">
                  <span className="material-symbols-outlined text-[16px]">sell</span>
                  Etiquetas (Opciones)
                </h3>
                <div className="space-y-2 mb-3">
                  {options.map((opt, idx) => (
                    <div key={opt} className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800/30 p-2 rounded-lg border border-gray-100 dark:border-gray-800">
                      <span className="flex-1 text-sm font-medium text-text-main dark:text-white">{opt}</span>
                      <button onClick={() => removeOption(idx)} className="text-red-400 hover:text-red-500 p-1">
                        <span className="material-symbols-outlined text-[18px]">delete</span>
                      </button>
                    </div>
                  ))}
                  {options.length === 0 && <p className="text-xs text-text-secondary italic p-2">Sin etiquetas definidas.</p>}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newOption}
                    onChange={(e) => setNewOption(e.target.value)}
                    placeholder="Ej. Término Medio..."
                    className="flex-1 bg-white dark:bg-black/20 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                    onKeyDown={(e) => e.key === 'Enter' && addOption()}
                  />
                  <button onClick={addOption} className="bg-gray-200 dark:bg-gray-700 text-text-main dark:text-white px-3 py-2 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 font-bold text-sm">
                    <span className="material-symbols-outlined">add</span>
                  </button>
                </div>
              </div>

            </div>
          )}
        </div>

        <div className="p-4 border-t border-gray-200 dark:border-gray-800 bg-surface-light dark:bg-surface-dark">
          <AppButton
            onClick={handleSave}
            isLoading={isSaving}
            className="w-full bg-primary hover:bg-primary-hover text-[#102218] font-bold py-3 rounded-xl shadow-lg shadow-primary/20 transition-all flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined">save</span>
            Guardar Cambios
          </AppButton>
        </div>
      </div>
    </div>
  );
};
