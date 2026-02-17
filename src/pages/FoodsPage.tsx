import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Search, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function FoodsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [nxResults, setNxResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedFood, setSelectedFood] = useState<any>(null);

  const { data: foods = [] } = useQuery({
    queryKey: ['my_foods'],
    queryFn: async () => {
      const { data } = await supabase.from('foods').select('*').order('name');
      return data ?? [];
    },
  });

  const searchNx = async () => {
    if (!search.trim()) return;
    setSearching(true);
    try {
      const { data, error } = await supabase.functions.invoke('nutritionix-search', {
        body: { query: search },
      });
      if (error) throw error;
      setNxResults(data?.results ?? []);
    } catch (e: any) {
      toast.error(e.message || 'Search failed');
    }
    setSearching(false);
  };

  const ingest = useMutation({
    mutationFn: async (item: any) => {
      const { data, error } = await supabase.functions.invoke('nutritionix-ingest', {
        body: { queryText: item.displayName, nutritionixId: item.nutritionixId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my_foods'] });
      setNxResults([]);
      setSearch('');
      toast.success('Food added!');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-bold">Foods</h1>

      {/* Search */}
      <div className="flex gap-2">
        <Input
          placeholder="Search Nutritionix..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && searchNx()}
        />
        <Button size="icon" onClick={searchNx} disabled={searching}>
          {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
        </Button>
      </div>

      {/* Nx results */}
      {nxResults.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground font-medium">Nutritionix Results</p>
          {nxResults.map((item: any, i: number) => (
            <Card key={i} className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => ingest.mutate(item)}>
              <CardContent className="p-3 text-sm">
                {item.displayName}{item.brandName ? ` — ${item.brandName}` : ''}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* My Foods */}
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

      {/* Food detail dialog */}
      <Dialog open={!!selectedFood} onOpenChange={() => setSelectedFood(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{selectedFood?.name}</DialogTitle></DialogHeader>
          {selectedFood && (
            <div className="space-y-2 text-sm">
              {selectedFood.brand && <p className="text-muted-foreground">Brand: {selectedFood.brand}</p>}
              <p className="text-muted-foreground">Source: {selectedFood.source}</p>
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
              {!selectedFood.serving_grams && (
                <p className="text-xs text-warning">⚠ Serving grams missing — per-100g values used as fallback</p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
