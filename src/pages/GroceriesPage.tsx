import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const STATUS_COLORS: Record<string, string> = {
  need: 'bg-destructive/10 text-destructive',
  low: 'bg-accent text-accent-foreground',
  have: 'bg-primary/10 text-primary',
};

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

  const toggleStatus = useMutation({
    mutationFn: async ({ id, current }: { id: string; current: string }) => {
      const next = current === 'need' ? 'have' : current === 'have' ? 'low' : 'need';
      await supabase.from('groceries').update({ status: next }).eq('id', id);
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

      <div className="flex gap-2">
        {['all', 'need', 'low', 'have'].map(s => (
          <Button key={s} variant={filter === s ? 'default' : 'outline'} size="sm" onClick={() => setFilter(s)} className="capitalize text-xs">
            {s}
          </Button>
        ))}
      </div>

      {filtered.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No items. Add foods to your grocery list.</p>}
      {filtered.map((g: any) => (
        <Card key={g.id}>
          <CardContent className="flex items-center justify-between p-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{g.foods?.name}</span>
              <Badge
                className={cn('cursor-pointer text-xs', STATUS_COLORS[g.status])}
                onClick={() => toggleStatus.mutate({ id: g.id, current: g.status })}
              >
                {g.status}
              </Badge>
            </div>
            <Button variant="ghost" size="icon" onClick={() => deleteGrocery.mutate(g.id)}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
