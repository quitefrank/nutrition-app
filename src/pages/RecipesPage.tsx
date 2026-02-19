import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SUPPORTED_UNITS } from '@/lib/units';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

export default function RecipesPage() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [servings, setServings] = useState('1');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [addIngOpen, setAddIngOpen] = useState(false);
  const [ingFoodId, setIngFoodId] = useState('');
  const [ingQty, setIngQty] = useState('100');
  const [ingUnit, setIngUnit] = useState('g');

  const { data: recipes = [] } = useQuery({
    queryKey: ['recipes'],
    queryFn: async () => {
      const { data } = await supabase.from('recipes').select('*, recipe_items(*)').order('name');
      return data ?? [];
    },
  });

  const { data: foods = [] } = useQuery({
    queryKey: ['my_foods'],
    queryFn: async () => {
      const { data } = await supabase.from('foods').select('id, name, calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g').order('name');
      return data ?? [];
    },
  });

  const detailRecipe = recipes.find((r: any) => r.id === detailId);
  const detailItems = detailRecipe?.recipe_items ?? [];
  const recipeTotals = detailItems.reduce(
    (acc: any, i: any) => ({ cal: acc.cal + Number(i.calories), p: acc.p + Number(i.protein), c: acc.c + Number(i.carbs), f: acc.f + Number(i.fat) }),
    { cal: 0, p: 0, c: 0, f: 0 }
  );

  const createRecipe = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('recipes').insert({
        name,
        servings: parseFloat(servings) || 1,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recipes'] });
      setCreateOpen(false);
      setName('');
      setServings('1');
      toast.success('Recipe created');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addIngredient = useMutation({
    mutationFn: async () => {
      if (!detailId) return;
      const food = foods.find(f => f.id === ingFoodId);
      if (!food) throw new Error('Select a food');
      const q = parseFloat(ingQty);
      const conversions: Record<string, number> = { g: 1, ml: 1, tbsp: 15, tsp: 5, cup: 240, oz: 28.3495, lb: 453.592 };
      const factor = conversions[ingUnit.toLowerCase()];
      if (!factor) throw new Error(`Unsupported unit: ${ingUnit}`);
      const grams = q * factor;

      await supabase.from('recipe_items').insert({
        recipe_id: detailId,
        food_id: ingFoodId,
        quantity: q,
        unit: ingUnit,
        grams_equivalent: grams,
        calories: (grams * Number(food.calories_per_100g)) / 100,
        protein: (grams * Number(food.protein_per_100g)) / 100,
        carbs: (grams * Number(food.carbs_per_100g)) / 100,
        fat: (grams * Number(food.fat_per_100g)) / 100,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recipes'] });
      setAddIngOpen(false);
      setIngFoodId('');
      setIngQty('100');
      setIngUnit('g');
      toast.success('Ingredient added');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteIngredient = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('recipe_items').delete().eq('id', id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recipes'] }),
  });

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Recipes</h1>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" /> New</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New Recipe</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Input placeholder="Recipe name" value={name} onChange={e => setName(e.target.value)} />
              <Input type="number" placeholder="Servings" value={servings} onChange={e => setServings(e.target.value)} />
              <Button className="w-full" onClick={() => createRecipe.mutate()} disabled={!name || createRecipe.isPending}>Create</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {recipes.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No recipes yet. Create one!</p>}
      {recipes.map((r: any) => {
        const t = (r.recipe_items ?? []).reduce(
          (acc: any, i: any) => ({ cal: acc.cal + Number(i.calories), p: acc.p + Number(i.protein), c: acc.c + Number(i.carbs), f: acc.f + Number(i.fat) }),
          { cal: 0, p: 0, c: 0, f: 0 }
        );
        const srv = Number(r.servings) || 1;
        return (
          <Card key={r.id} className="cursor-pointer" onClick={() => setDetailId(r.id)}>
            <CardContent className="p-3">
              <div className="font-medium text-sm">{r.name} <span className="text-muted-foreground">({srv} srv)</span></div>
              <div className="text-xs text-muted-foreground">
                Total: {Math.round(t.cal)} cal · Per srv: {Math.round(t.cal / srv)} cal
              </div>
            </CardContent>
          </Card>
        );
      })}

      <Dialog open={!!detailId} onOpenChange={() => setDetailId(null)}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{detailRecipe?.name}</DialogTitle></DialogHeader>
          {detailRecipe && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="font-medium">Total</p>
                  <p>{Math.round(recipeTotals.cal)} cal · {Math.round(recipeTotals.p)}p · {Math.round(recipeTotals.c)}c · {Math.round(recipeTotals.f)}f</p>
                </div>
                <div>
                  <p className="font-medium">Per Serving</p>
                  <p>{Math.round(recipeTotals.cal / Number(detailRecipe.servings))} cal · {Math.round(recipeTotals.p / Number(detailRecipe.servings))}p</p>
                </div>
              </div>

              <p className="text-xs font-medium text-muted-foreground">Ingredients</p>
              {detailItems.length === 0 && <p className="text-sm text-muted-foreground">No ingredients yet.</p>}
              {detailItems.map((item: any) => (
                <div key={item.id} className="flex items-center justify-between text-sm border-b pb-1">
                  <div>
                    <span>{item.quantity}{item.unit}</span>
                    <span className="text-muted-foreground ml-2">{Math.round(item.calories)} cal</span>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => deleteIngredient.mutate(item.id)}>
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              ))}

              {!addIngOpen ? (
                <Button variant="outline" size="sm" className="w-full" onClick={() => setAddIngOpen(true)}>
                  <Plus className="h-3 w-3 mr-1" /> Add Ingredient
                </Button>
              ) : (
                <div className="space-y-2 border rounded-md p-3">
                  <Select value={ingFoodId} onValueChange={setIngFoodId}>
                    <SelectTrigger><SelectValue placeholder="Select food" /></SelectTrigger>
                    <SelectContent>
                      {foods.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <div className="flex gap-2">
                    <Input type="number" value={ingQty} onChange={e => setIngQty(e.target.value)} className="flex-1" />
                    <Select value={ingUnit} onValueChange={setIngUnit}>
                      <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {SUPPORTED_UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" className="flex-1" onClick={() => addIngredient.mutate()} disabled={!ingFoodId || addIngredient.isPending}>Add</Button>
                    <Button size="sm" variant="outline" onClick={() => setAddIngOpen(false)}>Cancel</Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
