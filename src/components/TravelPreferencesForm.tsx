import { useCallback, useEffect, useMemo, useState } from "react";
import { Heart, Info, Loader2, RotateCcw, Save, Sliders } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { errorMessage } from "@/lib/errors";
import { getCurrencySymbol } from "@/lib/currency";
import {
  CATEGORY_LABELS,
  EDITABLE_CATEGORIES,
  NEUTRAL_WEIGHT,
  PACE_HINTS,
  PACE_LABELS,
  PACE_VALUES,
  defaultDraft,
  draftDistinctiveness,
  draftFromPreferences,
  preferencesPatch,
  type PreferenceDraft,
} from "@/lib/travelPreferences";
import type { Pace } from "@/lib/groupRegret";

/**
 * Lets a traveller state the preferences the group fairness score consumes.
 *
 * This is the missing input side of `lib/groupRegret.ts`. Until it existed the
 * Least Misery metric had nothing to read: every member scored every candidate
 * plan identically, which produces zero regret for everybody and tells the group
 * nothing. The score was real arithmetic over empty inputs.
 *
 * Deliberate choices:
 *   • Weights are shown as percentages but stored in [0,1], the units the
 *     scoring model uses. No conversion happens anywhere else.
 *   • Only the categories that actually affect the interest term get a control.
 *     Transport and accommodation are excluded from that term by design, so a
 *     slider for them would imply an effect it does not have.
 *   • An all-neutral setting is called out, because it is indistinguishable from
 *     having stated nothing at all.
 */

interface Props {
  /** Currency hint for the budget cap field. */
  country?: string | null;
  /** Called after a successful save, e.g. to re-run scoring. */
  onSaved?: () => void;
}

const WEIGHT_STEP = 0.05;

/** Short qualitative read-out for a weight, also used as the slider's a11y text. */
function weightLabel(weight: number): string {
  if (weight <= 0.05) return "Not interested";
  if (weight < 0.35) return "Low priority";
  if (weight < 0.65) return "Neutral";
  if (weight < 0.9) return "Keen";
  return "Must have";
}

export default function TravelPreferencesForm({ country, onSaved }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();

  const [draft, setDraft] = useState<PreferenceDraft>(defaultDraft);
  const [storedPreferences, setStoredPreferences] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const currencySymbol = getCurrencySymbol(country);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("preferences")
          .eq("id", user.id)
          .single();
        if (error) throw error;
        if (cancelled) return;

        const preferences = (data as { preferences?: unknown } | null)
          ?.preferences ?? null;
        setStoredPreferences(preferences);
        setDraft(draftFromPreferences(preferences));
      } catch {
        // A missing or unreadable profile row means "nothing stated yet", which
        // is a valid starting point — not an error worth interrupting the user.
        if (!cancelled) setDraft(defaultDraft());
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  const setWeight = useCallback((category: string, weight: number) => {
    setDraft((prev) => ({
      ...prev,
      categoryWeights: { ...prev.categoryWeights, [category]: weight },
    }));
    setDirty(true);
  }, []);

  const setPace = useCallback((pace: Pace) => {
    setDraft((prev) => ({ ...prev, pace }));
    setDirty(true);
  }, []);

  const setCeiling = useCallback((raw: string) => {
    const value = raw.trim() === "" ? null : Number(raw);
    setDraft((prev) => ({
      ...prev,
      budgetCeiling:
        value != null && Number.isFinite(value) && value > 0 ? value : null,
    }));
    setDirty(true);
  }, []);

  const reset = useCallback(() => {
    setDraft(draftFromPreferences(storedPreferences));
    setDirty(false);
  }, [storedPreferences]);

  const distinctiveness = useMemo(() => draftDistinctiveness(draft), [draft]);
  const isNeutral = distinctiveness < 0.02;

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const preferences = preferencesPatch(draft, storedPreferences);

      const { error } = await supabase
        .from("profiles")
        .update({ preferences: preferences as never })
        .eq("id", user.id);
      if (error) throw error;

      setStoredPreferences(preferences);
      setDirty(false);
      toast({
        title: "Preferences saved",
        description: isNeutral
          ? "All categories are neutral, so plans will still score equally. Move a few sliders to see the difference."
          : "Plans for your trips will now be scored against these.",
      });
      onSaved?.();
    } catch (error: unknown) {
      toast({
        title: "Could not save preferences",
        description: errorMessage(error),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-card rounded-2xl p-5 shadow-card">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          Loading your preferences…
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <section className="bg-card rounded-2xl p-5 shadow-card" aria-labelledby="prefs-heading">
      <div className="flex items-start justify-between gap-3 mb-1">
        <h3
          id="prefs-heading"
          className="font-semibold text-card-foreground flex items-center gap-2"
        >
          <Sliders className="w-4 h-4 text-primary" aria-hidden="true" />
          Plan Preferences
        </h3>
        {dirty && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-warning/10 text-warning font-semibold shrink-0">
            Unsaved
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground mb-5">
        Used to score trip plans for fairness across everyone travelling with
        you. The plan that leaves the least-satisfied member best off wins.
      </p>

      {/* Category weights */}
      <fieldset className="space-y-4 mb-6">
        <legend className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
          How much do these matter to you?
        </legend>

        {EDITABLE_CATEGORIES.map((category) => {
          const weight = draft.categoryWeights[category] ?? NEUTRAL_WEIGHT;
          const percent = Math.round(weight * 100);
          const inputId = `weight-${category}`;
          return (
            <div key={category}>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor={inputId}
                  className="text-sm text-card-foreground"
                >
                  {CATEGORY_LABELS[category]}
                </label>
                <span className="text-xs font-semibold text-muted-foreground tabular-nums">
                  {weightLabel(weight)}
                </span>
              </div>
              <input
                id={inputId}
                type="range"
                min={0}
                max={1}
                step={WEIGHT_STEP}
                value={weight}
                onChange={(e) => setWeight(category, Number(e.target.value))}
                aria-valuetext={`${percent} percent, ${weightLabel(weight)}`}
                className="w-full h-2 rounded-full bg-secondary accent-primary cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              />
            </div>
          );
        })}

        <p className="text-[11px] text-muted-foreground flex items-start gap-1.5 pt-1">
          <Info className="w-3 h-3 mt-0.5 shrink-0" aria-hidden="true" />
          Transport and accommodation are not listed: they are excluded from
          interest scoring, since nobody picks a trip for the airport transfer.
        </p>
      </fieldset>

      {/* Pace */}
      <fieldset className="mb-6">
        <legend className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Preferred pace
        </legend>
        <div className="grid grid-cols-3 gap-2">
          {PACE_VALUES.map((pace) => {
            const selected = draft.pace === pace;
            return (
              <label
                key={pace}
                className={`cursor-pointer rounded-xl border px-3 py-2.5 text-center transition-colors focus-within:ring-2 focus-within:ring-primary/40 ${
                  selected
                    ? "border-primary bg-primary/10"
                    : "border-border bg-background hover:bg-secondary/50"
                }`}
              >
                <input
                  type="radio"
                  name="preferred-pace"
                  value={pace}
                  checked={selected}
                  onChange={() => setPace(pace)}
                  className="sr-only"
                />
                <span
                  className={`block text-sm font-semibold ${
                    selected ? "text-primary" : "text-card-foreground"
                  }`}
                >
                  {PACE_LABELS[pace]}
                </span>
                <span className="block text-[10px] text-muted-foreground mt-0.5">
                  {PACE_HINTS[pace]}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {/* Budget ceiling */}
      <div className="mb-6">
        <label
          htmlFor="budget-ceiling"
          className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block"
        >
          Personal spend cap (optional)
        </label>
        <div className="relative">
          <span
            className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground"
            aria-hidden="true"
          >
            {currencySymbol}
          </span>
          <input
            id="budget-ceiling"
            type="number"
            min={0}
            inputMode="numeric"
            placeholder="No cap"
            value={draft.budgetCeiling ?? ""}
            onChange={(e) => setCeiling(e.target.value)}
            aria-describedby="budget-ceiling-hint"
            className="w-full pl-7 pr-3 py-2 rounded-xl bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <p id="budget-ceiling-hint" className="text-[11px] text-muted-foreground mt-1.5">
          Most you want to spend on a whole trip. Plans above it lose value for
          you specifically, without vetoing them for the group.
        </p>
      </div>

      {isNeutral && (
        <div
          className="mb-4 rounded-xl border border-warning/30 bg-warning/5 px-3 py-2.5 text-xs text-card-foreground flex items-start gap-2"
          role="status"
        >
          <Heart className="w-3.5 h-3.5 text-warning mt-0.5 shrink-0" aria-hidden="true" />
          <span>
            Everything is set to neutral, which scores identically to stating
            nothing. Move at least one slider so your voice counts in the
            fairness score.
          </span>
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !dirty}
          className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5 transition-opacity"
        >
          {saving ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <Save className="w-3.5 h-3.5" aria-hidden="true" />
          )}
          Save preferences
        </button>
        {dirty && (
          <button
            type="button"
            onClick={reset}
            disabled={saving}
            className="px-3 py-2 rounded-xl bg-secondary text-muted-foreground text-sm hover:bg-secondary/80 disabled:opacity-50 flex items-center gap-1.5 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            Discard
          </button>
        )}
      </div>
    </section>
  );
}
