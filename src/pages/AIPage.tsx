import { useState, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, Upload, Plus, Loader2, AlertTriangle, Check, RotateCcw, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { SUPPORTED_UNITS } from '@/lib/units';

interface Ingredient {
  rawLine: string;
  normalizedName: string;
  quantity: number | null;
  unit: string | null;
  confidence: number;
  usdaResults?: any[];
  selectedFdcId?: string;
  selectedFood?: any;
}

interface DecomposeResult {
  title: string | null;
  servings: number | null;
  ingredients: Ingredient[];
}

const UNIT_CONVERSIONS: Record<string, number> = {
  g: 1, ml: 1, tbsp: 15, tsp: 5, cup: 240, oz: 28.3495, lb: 453.592,
};

export default function AIPage() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [stage, setStage] = useState(0);
  const [mode, setMode] = useState<'photo' | 'phototext'>('photo');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [userContext, setUserContext] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');

  const [recipeTitle, setRecipeTitle] = useState('');
  const [recipeServings, setRecipeServings] = useState(1);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [createdRecipeId, setCreatedRecipeId] = useState<string | null>(null);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setImagePreview(dataUrl);
      setImageBase64(dataUrl.split(',')[1]);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleAnalyze = useCallback(async () => {
    if (!imageBase64) return;
    setLoading(true);
    setLoadingMessage('Analyzing image with AI…');

    try {
      // Stage 1: AI Decompose
      const { data: decomposeData, error: decomposeError } = await supabase.functions.invoke('ai-decompose', {
        body: { imageBase64, userContext: mode === 'phototext' ? userContext : undefined },
      });

      if (decomposeError) throw new Error(decomposeError.message);
      if (decomposeData?.error) throw new Error(decomposeData.error);

      const result = decomposeData as DecomposeResult;
      setRecipeTitle(result.title || 'Untitled Recipe');
      setRecipeServings(result.servings || 1);

      // Stage 2: USDA Matching
      setLoadingMessage('Matching ingredients to USDA database…');
      const matchedIngredients = await Promise.all(
        result.ingredients.map(async (ing) => {
          try {
            const { data: searchData } = await supabase.functions.invoke('fdc-search', {
              body: { query: ing.normalizedName },
            });
            const results = searchData?.results?.slice(0, 5) || [];
            return {
              ...ing,
              usdaResults: results,
              selectedFdcId: results[0]?.fdcId?.toString() || undefined,
            };
          } catch {
            return { ...ing, usdaResults: [], selectedFdcId: undefined };
          }
        })
      );

      setIngredients(matchedIngredients);
      setStage(3);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
      setLoadingMessage('');
    }
  }, [imageBase64, userContext, mode, toast]);

  const updateIngredient = useCallback((index: number, updates: Partial<Ingredient>) => {
    setIngredients(prev => prev.map((ing, i) => i === index ? { ...ing, ...updates } : ing));
  }, []);

  const addRow = useCallback(() => {
    setIngredients(prev => [...prev, {
      rawLine: '', normalizedName: '', quantity: null, unit: null,
      confidence: 1, usdaResults: [], selectedFdcId: undefined,
    }]);
  }, []);

  const removeRow = useCallback((index: number) => {
    setIngredients(prev => prev.filter((_, i) => i !== index));
  }, []);

  // Search USDA for a specific ingredient row
  const searchUsda = useCallback(async (index: number, query: string) => {
    if (!query.trim()) return;
    try {
      const { data } = await supabase.functions.invoke('fdc-search', { body: { query } });
      const results = data?.results?.slice(0, 5) || [];
      updateIngredient(index, { usdaResults: results, selectedFdcId: results[0]?.fdcId?.toString() });
    } catch { /* ignore */ }
  }, [updateIngredient]);

  // Issues summary
  const issues = useMemo(() => {
    const missingQty = ingredients.filter(i => i.quantity == null).length;
    const lowConfidence = ingredients.filter(i => i.confidence < 0.6).length;
    const invalidUnits = ingredients.filter(i => !i.unit || !SUPPORTED_UNITS.includes(i.unit as any)).length;
    return { missingQty, lowConfidence, invalidUnits };
  }, [ingredients]);

  // Live macro computation
  const macros = useMemo(() => {
    let totalCal = 0, totalProtein = 0, totalCarbs = 0, totalFat = 0;
    for (const ing of ingredients) {
      if (ing.quantity == null || !ing.unit || !ing.selectedFdcId) continue;
      const food = ing.usdaResults?.find(r => r.fdcId?.toString() === ing.selectedFdcId);
      if (!food) continue;
      // We don't have per-100g data from search results, so we'll fetch it on create
      // For live preview, we use a rough estimate if we have cached food data
      const factor = UNIT_CONVERSIONS[ing.unit.toLowerCase()];
      if (!factor) continue;
      const grams = ing.quantity * factor;
      // Store selectedFood reference for later
      if (ing.selectedFood) {
        totalCal += (grams * ing.selectedFood.calories_per_100g) / 100;
        totalProtein += (grams * ing.selectedFood.protein_per_100g) / 100;
        totalCarbs += (grams * ing.selectedFood.carbs_per_100g) / 100;
        totalFat += (grams * ing.selectedFood.fat_per_100g) / 100;
      }
    }
    return { totalCal, totalProtein, totalCarbs, totalFat };
  }, [ingredients]);

  // Ingest a food via fdc-ingest to cache it and get macro data
  const ingestFood = useCallback(async (fdcId: string) => {
    const { data } = await supabase.functions.invoke('fdc-ingest', { body: { fdcId: Number(fdcId) } });
    return data;
  }, []);

  // When user selects a USDA match, ingest it to get macro data for live preview
  const handleUsdaSelect = useCallback(async (index: number, fdcId: string) => {
    updateIngredient(index, { selectedFdcId: fdcId });
    try {
      const food = await ingestFood(fdcId);
      if (food) {
        updateIngredient(index, { selectedFdcId: fdcId, selectedFood: food });
      }
    } catch { /* ignore - macros won't show live */ }
  }, [updateIngredient, ingestFood]);

  const canCreate = useMemo(() => {
    return ingredients.length > 0 &&
      ingredients.every(i => i.quantity != null && i.unit && SUPPORTED_UNITS.includes(i.unit as any) && i.selectedFdcId) &&
      recipeTitle.trim() !== '';
  }, [ingredients, recipeTitle]);

  const handleCreate = useCallback(async () => {
    if (!canCreate) return;
    setLoading(true);
    setLoadingMessage('Creating recipe…');

    try {
      // Ensure all foods are ingested
      for (const ing of ingredients) {
        if (ing.selectedFdcId) {
          await ingestFood(ing.selectedFdcId);
        }
      }

      const { data, error } = await supabase.functions.invoke('ai-create-recipe', {
        body: {
          title: recipeTitle,
          servings: recipeServings,
          ingredients: ingredients.map(i => ({
            fdcId: i.selectedFdcId,
            quantity: i.quantity,
            unit: i.unit,
          })),
        },
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      setCreatedRecipeId(data.recipeId);
      setStage(4);
      toast({ title: 'Recipe created!', description: `${data.itemCount} ingredients added.` });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
      setLoadingMessage('');
    }
  }, [canCreate, ingredients, recipeTitle, recipeServings, ingestFood, toast]);

  const handleReset = useCallback(() => {
    setStage(0);
    setImagePreview(null);
    setImageBase64(null);
    setUserContext('');
    setRecipeTitle('');
    setRecipeServings(1);
    setIngredients([]);
    setCreatedRecipeId(null);
  }, []);

  // Stage 0: Upload
  if (stage === 0 || (stage < 3 && !loading)) {
    return (
      <div className="p-4 space-y-4">
        <h1 className="text-xl font-bold">AI Recipe Import</h1>

        <div className="flex gap-2">
          <Button
            variant={mode === 'photo' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setMode('photo')}
          >
            <Camera className="h-4 w-4 mr-1" /> Photo
          </Button>
          <Button
            variant={mode === 'phototext' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setMode('phototext')}
          >
            <Sparkles className="h-4 w-4 mr-1" /> Photo & Text
          </Button>
        </div>

        <Card>
          <CardContent className="pt-6 space-y-4">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileChange}
              className="hidden"
            />

            {imagePreview ? (
              <div className="relative">
                <img src={imagePreview} alt="Recipe" className="w-full rounded-lg max-h-64 object-cover" />
                <Button
                  variant="outline"
                  size="sm"
                  className="absolute top-2 right-2"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Change
                </Button>
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full h-40 border-2 border-dashed border-muted-foreground/30 rounded-lg flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-primary/50 transition-colors"
              >
                <Upload className="h-8 w-8" />
                <span className="text-sm">Tap to upload or take a photo</span>
              </button>
            )}

            {mode === 'phototext' && (
              <Textarea
                placeholder="Add context (e.g. 'This is a Thai curry recipe for 4 people')"
                value={userContext}
                onChange={e => setUserContext(e.target.value)}
                rows={3}
              />
            )}

            <Button
              className="w-full"
              disabled={!imageBase64 || loading}
              onClick={handleAnalyze}
            >
              {loading ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" /> {loadingMessage}</>
              ) : (
                'Analyze Recipe'
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div className="p-4 flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-muted-foreground">{loadingMessage}</p>
      </div>
    );
  }

  // Stage 4: Done
  if (stage === 4) {
    return (
      <div className="p-4 flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="rounded-full bg-primary/10 p-4">
          <Check className="h-8 w-8 text-primary" />
        </div>
        <h2 className="text-xl font-bold">Recipe Created!</h2>
        <div className="flex gap-2">
          <Button onClick={() => navigate('/recipes')}>View Recipes</Button>
          <Button variant="outline" onClick={handleReset}>
            <RotateCcw className="h-4 w-4 mr-1" /> Import Another
          </Button>
        </div>
      </div>
    );
  }

  // Stage 3: Review & Edit
  return (
    <div className="p-4 space-y-4 pb-20">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Review Recipe</h1>
        <Button variant="ghost" size="sm" onClick={handleReset}>
          <RotateCcw className="h-4 w-4" />
        </Button>
      </div>

      {/* Issues summary */}
      {(issues.missingQty > 0 || issues.lowConfidence > 0 || issues.invalidUnits > 0) && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="pt-4 pb-3 space-y-1">
            <div className="flex items-center gap-2 text-sm font-medium">
              <AlertTriangle className="h-4 w-4 text-destructive" /> Issues to resolve
            </div>
            {issues.missingQty > 0 && (
              <p className="text-xs text-muted-foreground">{issues.missingQty} ingredient(s) missing quantities</p>
            )}
            {issues.lowConfidence > 0 && (
              <p className="text-xs text-muted-foreground">{issues.lowConfidence} low-confidence match(es)</p>
            )}
            {issues.invalidUnits > 0 && (
              <p className="text-xs text-muted-foreground">{issues.invalidUnits} ingredient(s) need valid weight units (g, ml, tbsp, tsp, cup, oz, lb)</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Title & servings */}
      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-2">
          <label className="text-xs text-muted-foreground">Title</label>
          <Input value={recipeTitle} onChange={e => setRecipeTitle(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Servings</label>
          <Input type="number" min={1} value={recipeServings} onChange={e => setRecipeServings(Number(e.target.value) || 1)} />
        </div>
      </div>

      {/* Ingredients table */}
      <div className="space-y-2">
        {ingredients.map((ing, idx) => (
          <Card key={idx} className="p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">#{idx + 1}</span>
                <Badge variant={ing.confidence >= 0.6 ? 'default' : 'destructive'} className="text-xs">
                  {Math.round(ing.confidence * 100)}%
                </Badge>
              </div>
              <Button variant="ghost" size="sm" onClick={() => removeRow(idx)} className="h-6 w-6 p-0 text-muted-foreground">×</Button>
            </div>

            <Input
              placeholder="Ingredient name"
              value={ing.normalizedName}
              onChange={e => updateIngredient(idx, { normalizedName: e.target.value })}
              onBlur={() => searchUsda(idx, ing.normalizedName)}
              className="text-sm"
            />

            <div className="grid grid-cols-2 gap-2">
              <Input
                type="number"
                placeholder="Qty"
                value={ing.quantity ?? ''}
                onChange={e => updateIngredient(idx, { quantity: e.target.value ? Number(e.target.value) : null })}
                className={`text-sm ${ing.quantity == null ? 'border-destructive' : ''}`}
              />
              <Select value={ing.unit || ''} onValueChange={v => updateIngredient(idx, { unit: v })}>
                <SelectTrigger className={`text-sm ${!ing.unit ? 'border-destructive' : ''}`}>
                  <SelectValue placeholder="Unit" />
                </SelectTrigger>
                <SelectContent>
                  {SUPPORTED_UNITS.map(u => (
                    <SelectItem key={u} value={u}>{u}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Select
              value={ing.selectedFdcId || ''}
              onValueChange={v => handleUsdaSelect(idx, v)}
            >
              <SelectTrigger className="text-sm">
                <SelectValue placeholder="Select USDA match…" />
              </SelectTrigger>
              <SelectContent>
                {(ing.usdaResults || []).map((r: any) => (
                  <SelectItem key={r.fdcId} value={r.fdcId.toString()}>
                    {r.description} {r.brandOwner ? `(${r.brandOwner})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Per-ingredient macro preview */}
            {ing.selectedFood && ing.quantity != null && ing.unit && UNIT_CONVERSIONS[ing.unit.toLowerCase()] && (
              <div className="text-xs text-muted-foreground flex gap-3">
                {(() => {
                  const g = ing.quantity * UNIT_CONVERSIONS[ing.unit.toLowerCase()];
                  return <>
                    <span>{Math.round((g * ing.selectedFood.calories_per_100g) / 100)} cal</span>
                    <span>{Math.round((g * ing.selectedFood.protein_per_100g) / 100)}p</span>
                    <span>{Math.round((g * ing.selectedFood.carbs_per_100g) / 100)}c</span>
                    <span>{Math.round((g * ing.selectedFood.fat_per_100g) / 100)}f</span>
                  </>;
                })()}
              </div>
            )}
          </Card>
        ))}

        <Button variant="outline" size="sm" onClick={addRow} className="w-full">
          <Plus className="h-4 w-4 mr-1" /> Add Ingredient
        </Button>
      </div>

      {/* Macro totals */}
      {macros.totalCal > 0 && (
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-sm font-medium mb-1">Macro Totals</div>
            <div className="grid grid-cols-4 gap-2 text-center text-xs">
              <div><div className="font-bold text-lg">{Math.round(macros.totalCal)}</div>cal</div>
              <div><div className="font-bold text-lg">{Math.round(macros.totalProtein)}g</div>protein</div>
              <div><div className="font-bold text-lg">{Math.round(macros.totalCarbs)}g</div>carbs</div>
              <div><div className="font-bold text-lg">{Math.round(macros.totalFat)}g</div>fat</div>
            </div>
            {recipeServings > 1 && (
              <div className="mt-2 pt-2 border-t text-xs text-muted-foreground text-center">
                Per serving: {Math.round(macros.totalCal / recipeServings)} cal · {Math.round(macros.totalProtein / recipeServings)}p · {Math.round(macros.totalCarbs / recipeServings)}c · {Math.round(macros.totalFat / recipeServings)}f
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Create button */}
      <Button className="w-full" disabled={!canCreate || loading} onClick={handleCreate}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
        Create Recipe
      </Button>
      {!canCreate && ingredients.length > 0 && (
        <p className="text-xs text-muted-foreground text-center">
          Fill in all quantities, units, and USDA matches to create the recipe.
        </p>
      )}
    </div>
  );
}
