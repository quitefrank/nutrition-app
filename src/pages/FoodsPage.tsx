import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Loader2, Trash2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

export default function FoodsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [fdcResults, setFdcResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedFood, setSelectedFood] = useState<any>(null);

  // Delete state
  const [deleteConfirm, setDeleteConfirm] = useState<{ food: any; refs: { recipe: number; log: number; grocery: number } } | null>(null);

  // Replace state
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [replaceMode, setReplaceMode] = useState<'existing' | 'search'>('existing');
  const [replaceFoodId, setReplaceFoodId] = useState('');
  const [replaceSearch, setReplaceSearch] = useState('');
  const [replaceResults, setReplaceResults] = useState<any[]>([]);
  const [replaceSearching, setReplaceSearching] = useState(false);

  const { data: foods = [] } = useQuery({
    queryKey: ['my_foods'],
    queryFn: async () => {
      const { data } = await supabase.from('foods').select('*').order('name');
      return data ?? [];
    },
  });

  const searchFdc = async () => {
    if (!search.trim()) return;
    setSearching(true);
    try {
      const { data, error } = await supabase.functions.invoke('fdc-search', { body: { query: search } });
      if (error) throw error;
      setFdcResults(data?.results ?? []);
    } catch (e: any) {
      toast.error(e.message || 'Search failed');
    }
    setSearching(false);
  };

  const ingest = useMutation({
    mutationFn: async (item: any) => {
      const { data, error } = await supabase.functions.invoke('fdc-ingest', { body: { fdcId: item.fdcId } });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my_foods'] });
      setFdcResults([]);
      setSearch('');
      toast.success('Food added!');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // --- Delete Food ---
  const handleDeleteClick = async (food: any) => {
    const [{ count: recipe }, { count: log }, { count: grocery }] = await Promise.all([
      supabase.from('recipe_items').select('id', { count: 'exact', head: true }).eq('food_id', food.id),
      supabase.from('daily_log_items').select('id', { count: 'exact', head: true }).eq('food_id', food.id),
      supabase.from('groceries').select('id', { count: 'exact', head: true }).eq('food_id', food.id),
    ]);
    const refs = { recipe: recipe ?? 0, log: log ?? 0, grocery: grocery ?? 0 };
    if (refs.recipe + refs.log + refs.grocery > 0) {
      setDeleteConfirm({ food, refs });
    } else {
      await deleteFood(food.id);
    }
  };

  const deleteFood = async (id: string) => {
    await supabase.from('recipe_items').delete().eq('food_id', id);
    await supabase.from('daily_log_items').delete().eq('food_id', id);
    await supabase.from('groceries').delete().eq('food_id', id);
    await supabase.from('foods').delete().eq('id', id);
    qc.invalidateQueries({ queryKey: ['my_foods'] });
    qc.invalidateQueries({ queryKey: ['recipes'] });
    qc.invalidateQueries({ queryKey: ['groceries'] });
    qc.invalidateQueries({ queryKey: ['daily_log'] });
    setSelectedFood(null);
    setDeleteConfirm(null);
    toast.success('Food deleted');
  };

  // --- Replace Food ---
  const openReplace = () => {
    setReplaceOpen(true);
    setReplaceMode('existing');
    setReplaceFoodId('');
    setReplaceSearch('');
    setReplaceResults([]);
  };

  const searchReplacement = async () => {
    if (!replaceSearch.trim()) return;
    setReplaceSearching(true);
    try {
      const { data, error } = await supabase.functions.invoke('fdc-search', { body: { query: replaceSearch } });
      if (error) throw error;
      setReplaceResults(data?.results ?? []);
    } catch (e: any) {
      toast.error(e.message || 'Search failed');
    }
    setReplaceSearching(false);
  };

  const ingestAndReplace = useMutation({
    mutationFn: async (item: any) => {
      const { data, error } = await supabase.functions.invoke('fdc-ingest', { body: { fdcId: item.fdcId } });
      if (error) throw error;
      return data;
    },
    onSuccess: async (data: any) => {
      if (data?.id) {
        await executeReplace(data.id);
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const executeReplace = async (newFoodId: string) => {
    if (!selectedFood) return;
    try {
      const { data, error } = await supabase.functions.invoke('food-replace', {
        body: { oldFoodId: selectedFood.id, newFoodId },
      });
      if (error) throw error;
      toast.success(`Replaced across ${data.recipeItems} recipe items, ${data.logItems} log items, ${data.groceryItems} grocery items.`);
      qc.invalidateQueries({ queryKey: ['my_foods'] });
      qc.invalidateQueries({ queryKey: ['recipes'] });
      qc.invalidateQueries({ queryKey: ['groceries'] });
      qc.invalidateQueries({ queryKey: ['daily_log'] });
      setReplaceOpen(false);
      setSelectedFood(null);
    } catch (e: any) {
      toast.error(e.message || 'Replace failed');
    }
  };

  const handleReplaceConfirm = () => {
    if (replaceMode === 'existing' && replaceFoodId) {
      executeReplace(replaceFoodId);
    }
  };

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-bold">Foods</h1>

      <div className="flex gap-2">
        <Input
          placeholder="Search USDA FoodData Central..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && searchFdc()}
        />
        <Button size="icon" onClick={searchFdc} disabled={searching}>
          {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
        </Button>
      </div>

      {fdcResults.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground font-medium">USDA FDC Results</p>
          {fdcResults.map((item: any, i: number) => (
            <Card key={i} className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => ingest.mutate(item)}>
              <CardContent className="p-3 text-sm">
                {item.description}{item.brandOwner ? ` — ${item.brandOwner}` : ''}
                <span className="text-xs text-muted-foreground ml-2">({item.dataType})</span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <p className="text-xs text-muted-foreground font-medium">My Foods ({foods.length})</p>
        {foods.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">No foods cached yet. Search above to add.</p>}
        {foods.map((food: any) => (
          <Card key={food.id} className="cursor-pointer" onClick={() => setSelectedFood(food)}>
            <CardContent className="p-3">
              <div className="font-medium text-sm">{food.name}</div>
              <div className="text-xs text-muted-foreground">
                per 100g: {Math.round(food.calories_per_100g)} cal · {Math.round(food.protein_per_100g)}p · {Math.round(food.carbs_per_100g)}c · {Math.round(food.fat_per_100g)}f
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Food Detail Dialog */}
      <Dialog open={!!selectedFood && !replaceOpen} onOpenChange={() => setSelectedFood(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{selectedFood?.name}</DialogTitle></DialogHeader>
          {selectedFood && (
            <div className="space-y-3 text-sm">
              {selectedFood.brand && <p className="text-muted-foreground">Brand: {selectedFood.brand}</p>}
              <p className="text-muted-foreground">Source: USDA FDC</p>
              <div className="grid grid-cols-2 gap-4 mt-3">
                <div>
                  <p className="font-medium mb-1">Per 100g</p>
                  <p>Cal: {Math.round(selectedFood.calories_per_100g)}</p>
                  <p>Protein: {Math.round(selectedFood.protein_per_100g)}g</p>
                  <p>Carbs: {Math.round(selectedFood.carbs_per_100g)}g</p>
                  <p>Fat: {Math.round(selectedFood.fat_per_100g)}g</p>
                </div>
                {selectedFood.serving_grams && (
                  <div>
                    <p className="font-medium mb-1">Per Serving ({Math.round(selectedFood.serving_grams)}g)</p>
                    <p>Cal: {Math.round(selectedFood.calories_per_serving)}</p>
                    <p>Protein: {Math.round(selectedFood.protein_per_serving)}g</p>
                    <p>Carbs: {Math.round(selectedFood.carbs_per_serving)}g</p>
                    <p>Fat: {Math.round(selectedFood.fat_per_serving)}g</p>
                  </div>
                )}
              </div>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" size="sm" className="flex-1" onClick={openReplace}>
                  <RefreshCw className="h-3 w-3 mr-1" /> Replace…
                </Button>
                <Button variant="destructive" size="sm" className="flex-1" onClick={() => handleDeleteClick(selectedFood)}>
                  <Trash2 className="h-3 w-3 mr-1" /> Delete
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteConfirm?.food?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This food is referenced in {deleteConfirm?.refs.recipe} recipe item(s), {deleteConfirm?.refs.log} daily log item(s), and {deleteConfirm?.refs.grocery} grocery item(s). Deleting will remove all references.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteConfirm && deleteFood(deleteConfirm.food.id)}>
              Delete and remove references
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Replace Food Dialog */}
      <Dialog open={replaceOpen} onOpenChange={setReplaceOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Replace {selectedFood?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Button variant={replaceMode === 'existing' ? 'default' : 'outline'} size="sm" onClick={() => setReplaceMode('existing')}>
                Existing Food
              </Button>
              <Button variant={replaceMode === 'search' ? 'default' : 'outline'} size="sm" onClick={() => setReplaceMode('search')}>
                USDA Search
              </Button>
            </div>

            {replaceMode === 'existing' && (
              <div className="space-y-2">
                <Select value={replaceFoodId} onValueChange={setReplaceFoodId}>
                  <SelectTrigger><SelectValue placeholder="Select replacement food" /></SelectTrigger>
                  <SelectContent>
                    {foods.filter(f => f.id !== selectedFood?.id).map(f => (
                      <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button className="w-full" onClick={handleReplaceConfirm} disabled={!replaceFoodId}>
                  Replace
                </Button>
              </div>
            )}

            {replaceMode === 'search' && (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Input
                    placeholder="Search USDA..."
                    value={replaceSearch}
                    onChange={e => setReplaceSearch(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && searchReplacement()}
                  />
                  <Button size="icon" onClick={searchReplacement} disabled={replaceSearching}>
                    {replaceSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  </Button>
                </div>
                {replaceResults.map((item: any, i: number) => (
                  <Card key={i} className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => ingestAndReplace.mutate(item)}>
                    <CardContent className="p-2 text-sm">
                      {item.description}{item.brandOwner ? ` — ${item.brandOwner}` : ''}
                      <span className="text-xs text-muted-foreground ml-2">({item.dataType})</span>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
