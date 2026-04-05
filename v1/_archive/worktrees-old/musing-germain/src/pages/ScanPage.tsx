import { useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Camera, Loader2, RotateCcw } from "lucide-react";
import { convertToGrams, SUPPORTED_UNITS, type SupportedUnit } from "@/lib/units";

interface ScanItem {
  name: string;
  quantity: number | null;
  unit: string | null;
  grams_estimate: number | null;
}

interface ScanResult {
  type: "food" | "recipe";
  title: string | null;
  servings: number | null;
  items: ScanItem[];
}

interface ProcessedItem {
  name: string;
  quantity: number | null;
  unit: string | null;
  grams_estimate: number | null;
  grams_equivalent: number;
  foodId: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

interface UndoData {
  type: "recipe" | "food";
  recipeId?: string;
  recipeItemIds?: string[];
  logItemId?: string;
  dailyLogId?: string;
  dailyLogWasNew?: boolean;
}

type Stage = "idle" | "scanning" | "done";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

async function invokeFn(name: string, body: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

function resolveGrams(item: ScanItem, scanType: "food" | "recipe"): number {
  if (item.grams_estimate != null && item.grams_estimate > 0) return item.grams_estimate;
  if (item.quantity != null && item.unit != null) {
    const u = item.unit.toLowerCase() as SupportedUnit;
    if ((SUPPORTED_UNITS as readonly string[]).includes(u)) {
      return convertToGrams(item.quantity, u);
    }
  }
  return scanType === "food" ? 100 : 0;
}

export default function ScanPage() {
  const [stage, setStage] = useState<Stage>("idle");
  const [statusMsg, setStatusMsg] = useState("");
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [processedItems, setProcessedItems] = useState<ProcessedItem[]>([]);
  const [undoData, setUndoData] = useState<UndoData | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const reset = useCallback(() => {
    setStage("idle");
    setStatusMsg("");
    setScanResult(null);
    setProcessedItems([]);
    setUndoData(null);
    setImagePreview(null);
    if (fileRef.current) fileRef.current.value = "";
  }, []);

  const handleUndo = useCallback(async () => {
    if (!undoData) return;
    try {
      if (undoData.type === "recipe") {
        if (undoData.recipeItemIds?.length) {
          await supabase.from("recipe_items").delete().in("id", undoData.recipeItemIds);
        }
        if (undoData.recipeId) {
          await supabase.from("recipes").delete().eq("id", undoData.recipeId);
        }
      } else {
        if (undoData.logItemId) {
          await supabase.from("daily_log_items").delete().eq("id", undoData.logItemId);
        }
        if (undoData.dailyLogWasNew && undoData.dailyLogId) {
          const { count } = await supabase
            .from("daily_log_items")
            .select("id", { count: "exact", head: true })
            .eq("daily_log_id", undoData.dailyLogId);
          if (count === 0) {
            await supabase.from("daily_logs").delete().eq("id", undoData.dailyLogId);
          }
        }
      }
      toast({ title: "Undone" });
      reset();
    } catch (e: any) {
      toast({ title: "Undo failed", description: e.message, variant: "destructive" });
    }
  }, [undoData, toast, reset]);

  const handleScan = useCallback(async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return;

    setStage("scanning");

    try {
      // Convert to base64
      setStatusMsg("Preparing image...");
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      const imageBase64 = btoa(binary);
      setImagePreview(`data:${file.type};base64,${imageBase64}`);

      // 1. AI scan
      setStatusMsg("Analyzing image...");
      const scan: ScanResult = await invokeFn("ai-scan", { imageBase64 });
      setScanResult(scan);

      // 2. USDA match + ingest
      setStatusMsg("Matching USDA foods...");
      const items: ProcessedItem[] = [];
      for (const item of scan.items) {
        try {
          const searchRes = await invokeFn("fdc-search", { query: item.name });
          const top = searchRes.results?.[0];
          if (!top) {
            console.warn(`No USDA match for "${item.name}", skipping`);
            continue;
          }
          const ingestRes = await invokeFn("fdc-ingest", { fdcId: top.fdcId });
          const food = ingestRes.food;

          const grams = resolveGrams(item, scan.type);
          const calories = (grams * food.calories_per_100g) / 100;
          const protein = (grams * food.protein_per_100g) / 100;
          const carbs = (grams * food.carbs_per_100g) / 100;
          const fat = (grams * food.fat_per_100g) / 100;

          items.push({
            name: item.name,
            quantity: item.quantity,
            unit: item.unit,
            grams_estimate: item.grams_estimate,
            grams_equivalent: grams,
            foodId: food.id,
            calories: Math.round(calories * 10) / 10,
            protein: Math.round(protein * 10) / 10,
            carbs: Math.round(carbs * 10) / 10,
            fat: Math.round(fat * 10) / 10,
          });
        } catch (e) {
          console.warn(`Failed to process "${item.name}":`, e);
        }
      }
      setProcessedItems(items);

      if (items.length === 0) {
        toast({ title: "No items could be matched", variant: "destructive" });
        setStage("done");
        return;
      }

      // 3. Auto-save
      setStatusMsg("Saving...");
      let undo: UndoData;

      if (scan.type === "recipe") {
        const servings = scan.servings ?? 1;
        const { data: recipe, error: rErr } = await supabase
          .from("recipes")
          .insert({ name: scan.title || "Scanned Recipe", servings })
          .select("id")
          .single();
        if (rErr) throw rErr;

        const recipeItemRows = items.map((it) => ({
          recipe_id: recipe.id,
          food_id: it.foodId,
          quantity: it.quantity ?? 0,
          unit: it.unit ?? "g",
          grams_equivalent: it.grams_equivalent,
          calories: it.calories,
          protein: it.protein,
          carbs: it.carbs,
          fat: it.fat,
        }));
        const { data: riData, error: riErr } = await supabase
          .from("recipe_items")
          .insert(recipeItemRows)
          .select("id");
        if (riErr) throw riErr;

        undo = {
          type: "recipe",
          recipeId: recipe.id,
          recipeItemIds: riData.map((r: any) => r.id),
        };
      } else {
        // food -> daily log
        const today = new Date().toISOString().slice(0, 10);
        let dailyLogWasNew = false;

        let { data: log } = await supabase
          .from("daily_logs")
          .select("id")
          .eq("log_date", today)
          .maybeSingle();

        if (!log) {
          const { data: newLog, error: dlErr } = await supabase
            .from("daily_logs")
            .insert({ log_date: today })
            .select("id")
            .single();
          if (dlErr) throw dlErr;
          log = newLog;
          dailyLogWasNew = true;
        }

        const totals = items.reduce(
          (acc, it) => ({
            calories: acc.calories + it.calories,
            protein: acc.protein + it.protein,
            carbs: acc.carbs + it.carbs,
            fat: acc.fat + it.fat,
            grams: acc.grams + it.grams_equivalent,
          }),
          { calories: 0, protein: 0, carbs: 0, fat: 0, grams: 0 }
        );

        const { data: logItem, error: liErr } = await supabase
          .from("daily_log_items")
          .insert({
            daily_log_id: log.id,
            food_id: items[0].foodId,
            grams_equivalent: totals.grams,
            calories: Math.round(totals.calories * 10) / 10,
            protein: Math.round(totals.protein * 10) / 10,
            carbs: Math.round(totals.carbs * 10) / 10,
            fat: Math.round(totals.fat * 10) / 10,
          })
          .select("id")
          .single();
        if (liErr) throw liErr;

        undo = {
          type: "food",
          logItemId: logItem.id,
          dailyLogId: log.id,
          dailyLogWasNew,
        };
      }

      setUndoData(undo);
      setStage("done");
      toast({
        title: "Saved!",
        description: scan.type === "recipe" ? "Recipe created" : "Logged to today",
        action: (
          <Button variant="outline" size="sm" onClick={handleUndo}>
            Undo
          </Button>
        ),
      });
    } catch (e: any) {
      console.error("Scan pipeline error:", e);
      toast({ title: "Scan failed", description: e.message, variant: "destructive" });
      setStage("idle");
    }
  }, [toast, handleUndo, reset]);

  const totals = processedItems.reduce(
    (a, i) => ({
      calories: a.calories + i.calories,
      protein: a.protein + i.protein,
      carbs: a.carbs + i.carbs,
      fat: a.fat + i.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

  const servings = scanResult?.servings ?? 1;

  return (
    <div className="p-4 pb-20 space-y-4">
      <h1 className="text-xl font-bold">Photo Scan</h1>

      {stage === "idle" && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="flex flex-col items-center gap-3">
              <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed rounded-lg cursor-pointer border-muted-foreground/25 hover:border-primary/50 transition-colors">
                <Camera className="h-10 w-10 text-muted-foreground mb-2" />
                <span className="text-sm text-muted-foreground">Tap to take photo or choose file</span>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={() => {
                    if (fileRef.current?.files?.[0]) {
                      const url = URL.createObjectURL(fileRef.current.files[0]);
                      setImagePreview(url);
                    }
                  }}
                />
              </label>
              {imagePreview && (
                <img src={imagePreview} alt="Preview" className="w-full max-h-48 object-contain rounded-lg" />
              )}
              <Button className="w-full" size="lg" disabled={!fileRef.current?.files?.length && !imagePreview} onClick={handleScan}>
                <Camera className="mr-2 h-5 w-5" /> Scan
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {stage === "scanning" && (
        <Card>
          <CardContent className="pt-6 flex flex-col items-center gap-4 py-12">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">{statusMsg}</p>
          </CardContent>
        </Card>
      )}

      {stage === "done" && scanResult && (
        <>
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Badge variant={scanResult.type === "recipe" ? "default" : "secondary"}>
                  {scanResult.type === "recipe" ? "Recipe" : "Food"}
                </Badge>
                <CardTitle className="text-lg">{scanResult.title || "Scanned Item"}</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-4 gap-2 text-center">
                <MacroBox label="Cal" value={totals.calories} />
                <MacroBox label="Protein" value={totals.protein} suffix="g" />
                <MacroBox label="Carbs" value={totals.carbs} suffix="g" />
                <MacroBox label="Fat" value={totals.fat} suffix="g" />
              </div>
              {scanResult.type === "recipe" && servings > 1 && (
                <div className="pt-1">
                  <p className="text-xs text-muted-foreground mb-1">Per serving ({servings} servings)</p>
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <MacroBox label="Cal" value={totals.calories / servings} />
                    <MacroBox label="Protein" value={totals.protein / servings} suffix="g" />
                    <MacroBox label="Carbs" value={totals.carbs / servings} suffix="g" />
                    <MacroBox label="Fat" value={totals.fat / servings} suffix="g" />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {processedItems.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Breakdown</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {processedItems.map((it, i) => (
                  <div key={i} className="flex justify-between items-start text-sm border-b last:border-0 pb-2 last:pb-0">
                    <div>
                      <p className="font-medium">{it.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {it.quantity != null && it.unit ? `${it.quantity} ${it.unit}` : `~${Math.round(it.grams_equivalent)}g (est.)`}
                      </p>
                    </div>
                    <div className="text-right text-xs text-muted-foreground whitespace-nowrap">
                      {Math.round(it.calories)} cal · {Math.round(it.protein)}p · {Math.round(it.carbs)}c · {Math.round(it.fat)}f
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Button variant="outline" className="w-full" onClick={reset}>
            <RotateCcw className="mr-2 h-4 w-4" /> Scan Another
          </Button>
        </>
      )}
    </div>
  );
}

function MacroBox({ label, value, suffix }: { label: string; value: number; suffix?: string }) {
  return (
    <div className="rounded-lg bg-muted p-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-semibold text-sm">
        {Math.round(value * 10) / 10}
        {suffix && <span className="text-xs font-normal">{suffix}</span>}
      </p>
    </div>
  );
}
