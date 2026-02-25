import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, addDays, subDays } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SUPPORTED_UNITS } from '@/lib/units';
import { ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

export default function TodayPage() {
  const qc = useQueryClient();
  const [date, setDate] = useState(new Date());
  const dateStr = format(date, 'yyyy-MM-dd');
  const [open, setOpen] = useState(false);
  const [entryType, setEntryType] = useState<'food' | 'recipe'>('food');
  const [selectedId, setSelectedId] = useState('');
  const [qty, setQty] = useState('100');
  const [unit, setUnit] = useState('g');
  const [servingsInput, setServingsInput] = useState('1');

  const { data: dailyLog } = useQuery({
    queryKey: ['daily_log', dateStr],
    queryFn: async () => {
      const { data } = await supabase.from('daily_logs').select('*').eq('log_date', dateStr).maybeSingle();
      return data;
    },
  });

  const { data: items = [] } = useQuery({
    queryKey: ['daily_log_items', dailyLog?.id],
    enabled: !!dailyLog?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('daily_log_items')
        .select('*, foods(name), recipes(name)')
        .eq('daily_log_id', dailyLog!.id)
        .order('created_at');
      return data ?? [];
    },
  });

  const { data: foods = [] } = useQuery({
    queryKey: ['my_foods'],
    queryFn: async () => {
      const { data } = await supabase.from('foods').select('id, name').order('name');
      return data ?? [];
    },
  });

  const { data: recipes = [] } = useQuery({
    queryKey: ['my_recipes_list'],
    queryFn: async () => {
      const { data } = await supabase.from('recipes').select('id, name, servings').order('name');
      return data ?? [];
    },
  });

  const addEntry = useMutation({
    mutationFn: async () => {
      let logId = dailyLog?.id;
      if (!logId) {
        const { data, error } = await supabase
          .from('daily_logs')
          .upsert({ log_date: dateStr }, { onConflict: 'log_date' })
          .select('id')
          .single();
        if (error) throw error;
        logId = data.id;
      }

      if (entryType === 'food') {
        const food = foods.find(f => f.id === selectedId);
        if (!food) throw new Error('Select a food');
        const { data: fullFood } = await supabase.from('foods').select('*').eq('id', selectedId).single();
        if (!fullFood) throw new Error('Food not found');

        const quantityNum = parseFloat(qty);
        const unitConversions: Record<string, number> = { g: 1, ml: 1, tbsp: 15, tsp: 5, cup: 240, oz: 28.3495, lb: 453.592 };
        const factor = unitConversions[unit.toLowerCase()];
        if (!factor) throw new Error(`Unsupported unit: ${unit}`);
        const grams = quantityNum * factor;

        await supabase.from('daily_log_items').insert({
          daily_log_id: logId,
          food_id: selectedId,
          quantity: quantityNum,
          unit,
          grams_equivalent: grams,
          calories: (grams * fullFood.calories_per_100g) / 100,
          protein: (grams * fullFood.protein_per_100g) / 100,
          carbs: (grams * fullFood.carbs_per_100g) / 100,
          fat: (grams * fullFood.fat_per_100g) / 100,
        });
      } else {
        const recipe = recipes.find(r => r.id === selectedId);
        if (!recipe) throw new Error('Select a recipe');
        const { data: recipeItems } = await supabase.from('recipe_items').select('*').eq('recipe_id', selectedId);
        const totals = (recipeItems ?? []).reduce(
          (acc, i) => ({ cal: acc.cal + Number(i.calories), p: acc.p + Number(i.protein), c: acc.c + Number(i.carbs), f: acc.f + Number(i.fat) }),
          { cal: 0, p: 0, c: 0, f: 0 }
        );
        const srvInput = parseFloat(servingsInput) || 1;
        const perServing = {
          cal: totals.cal / Number(recipe.servings),
          p: totals.p / Number(recipe.servings),
          c: totals.c / Number(recipe.servings),
          f: totals.f / Number(recipe.servings),
        };

        await supabase.from('daily_log_items').insert({
          daily_log_id: logId,
          recipe_id: selectedId,
          servings: srvInput,
          calories: perServing.cal * srvInput,
          protein: perServing.p * srvInput,
          carbs: perServing.c * srvInput,
          fat: perServing.f * srvInput,
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['daily_log', dateStr] });
      qc.invalidateQueries({ queryKey: ['daily_log_items'] });
      setOpen(false);
      toast.success('Entry added');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteItem = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('daily_log_items').delete().eq('id', id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['daily_log_items'] }),
  });

  const totals = items.reduce(
    (acc, i) => ({
      cal: acc.cal + Number(i.calories),
      p: acc.p + Number(i.protein),
      c: acc.c + Number(i.carbs),
      f: acc.f + Number(i.fat),
    }),
    { cal: 0, p: 0, c: 0, f: 0 }
  );

  return (
    <div className="p-4 space-y-4">
      {/* Date nav */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={() => setDate(d => subDays(d, 1))}><ChevronLeft className="h-5 w-5" /></Button>
        <h2 className="font-semibold">{format(date, 'EEE, MMM d')}</h2>
        <Button variant="ghost" size="icon" onClick={() => setDate(d => addDays(d, 1))}><ChevronRight className="h-5 w-5" /></Button>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-4 gap-2 text-center">
        {[
          { label: 'Cal', val: totals.cal },
          { label: 'Protein', val: totals.p },
          { label: 'Carbs', val: totals.c },
          { label: 'Fat', val: totals.f },
        ].map(({ label, val }) => (
          <Card key={label}>
            <CardContent className="p-2">
              <div className="text-lg font-bold">{Math.round(val)}</div>
              <div className="text-xs text-muted-foreground">{label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Items */}
      <div className="space-y-2">
        {items.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">No entries yet. Tap + to add.</p>}
        {items.map((item: any) => (
          <Card key={item.id}>
            <CardContent className="flex items-center justify-between p-3">
              <div>
                <div className="font-medium text-sm">{item.foods?.name || item.recipes?.name}</div>
                <div className="text-xs text-muted-foreground">
                  {Math.round(item.calories)} cal · {Math.round(item.protein)}p · {Math.round(item.carbs)}c · {Math.round(item.fat)}f
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => deleteItem.mutate(item.id)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Add entry */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button className="fixed bottom-20 right-4 h-12 w-12 rounded-full shadow-lg" size="icon">
            <Plus className="h-6 w-6" />
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Entry</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Select value={entryType} onValueChange={(v: 'food' | 'recipe') => { setEntryType(v); setSelectedId(''); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="food">Food</SelectItem>
                <SelectItem value="recipe">Recipe</SelectItem>
              </SelectContent>
            </Select>

            {entryType === 'food' ? (
              <>
                <Select value={selectedId} onValueChange={setSelectedId}>
                  <SelectTrigger><SelectValue placeholder="Select food" /></SelectTrigger>
                  <SelectContent>
                    {foods.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <div className="flex gap-2">
                  <Input type="number" value={qty} onChange={e => setQty(e.target.value)} placeholder="Qty" className="flex-1" />
                  <Select value={unit} onValueChange={setUnit}>
                    <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SUPPORTED_UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </>
            ) : (
              <>
                <Select value={selectedId} onValueChange={setSelectedId}>
                  <SelectTrigger><SelectValue placeholder="Select recipe" /></SelectTrigger>
                  <SelectContent>
                    {recipes.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input type="number" value={servingsInput} onChange={e => setServingsInput(e.target.value)} placeholder="Servings" />
              </>
            )}

            <Button className="w-full" onClick={() => addEntry.mutate()} disabled={!selectedId || addEntry.isPending}>
              Add
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
