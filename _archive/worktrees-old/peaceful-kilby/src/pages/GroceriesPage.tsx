import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

export default function GroceriesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [foodId, setFoodId] = useState('');
  const [filter, setFilter] = useState<string>('all');

  const { data: groceries = [] } = useQuery({
    queryKey: ['groceries'],
    queryFn: async () => {
      const { data } = await supabase.from('groceries').select('*, foods(name)').order('created_at', { ascending: false });
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

  const addGrocery = useMutation({
    mutationFn: async () => {
      if (!foodId) return;
      const { error } = await supabase.from('groceries').insert({ food_id: foodId });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['groceries'] });
      setOpen(false);
      setFoodId('');
      toast.success('Added to groceries');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      await supabase.from('groceries').update({ status }).eq('id', id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['groceries'] }),
  });

  const deleteGrocery = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('groceries').delete().eq('id', id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['groceries'] }),
  });

  const filtered = filter === 'all' ? groceries : groceries.filter((g: any) => g.status === filter);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Groceries</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" /> Add</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Grocery Item</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Select value={foodId} onValueChange={setFoodId}>
                <SelectTrigger><SelectValue placeholder="Select food" /></SelectTrigger>
                <SelectContent>
                  {foods.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button className="w-full" onClick={() => addGrocery.mutate()} disabled={!foodId || addGrocery.isPending}>Add</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filter dropdown */}
      <Select value={filter} onValueChange={setFilter}>
        <SelectTrigger className="w-32">
          <SelectValue placeholder="Filter" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
          <SelectItem value="need">Need</SelectItem>
          <SelectItem value="low">Low</SelectItem>
          <SelectItem value="have">Have</SelectItem>
        </SelectContent>
      </Select>

      {filtered.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No items. Add foods to your grocery list.</p>}
      {filtered.map((g: any) => (
        <Card key={g.id}>
          <CardContent className="flex items-center gap-2 p-3">
            {g.status === 'need' && (
              <Checkbox
                onCheckedChange={() => updateStatus.mutate({ id: g.id, status: 'have' })}
              />
            )}
            <span className="text-sm font-medium flex-1">{g.foods?.name}</span>
            <Select value={g.status} onValueChange={(val) => updateStatus.mutate({ id: g.id, status: val })}>
              <SelectTrigger className="w-20 h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="need">need</SelectItem>
                <SelectItem value="low">low</SelectItem>
                <SelectItem value="have">have</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="ghost" size="icon" onClick={() => deleteGrocery.mutate(g.id)}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
