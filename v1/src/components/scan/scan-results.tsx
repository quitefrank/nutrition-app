'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { GlassCard } from '@/components/ui/glass-card'
import { formatDishAlt } from '@/lib/utils'
import { DishDetailSheet } from './dish-detail-sheet'
import { useSaveRecipe, useDeleteRecipe } from '@/hooks/use-recipes'
import { useRestaurantSearch } from '@/hooks/use-search'
import type { ScanResult, DishResult, RecipeSaveRequest } from '@/types/api'

interface ScanResultsProps {
  result: ScanResult
  scanId: string
  onRetake?: () => void
}

export function ScanResults({ result, scanId, onRetake: onRetakeProp }: ScanResultsProps) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [selectedDishIndex, setSelectedDishIndex] = useState<number | null>(null)
  const [savedDishIds, setSavedDishIds] = useState<Record<string, string>>({})

  // Subscribe to TQ cache so enrichment updates are reflected reactively
  const { data: liveResult } = useQuery<ScanResult>({
    queryKey: ['scan-result', scanId],
    queryFn: () => queryClient.getQueryData<ScanResult>(['scan-result', scanId]) ?? result,
    enabled: false,       // never auto-fetch — data arrives via setQueryData
    initialData: result,  // seed from the prop passed in by the page
    staleTime: Infinity,  // treat as always fresh; we control updates via setQueryData
  })

  // Use liveResult throughout — falls back to prop if query hasn't updated yet
  const activeResult = liveResult ?? result

  const saveMutation = useSaveRecipe()
  const deleteMutation = useDeleteRecipe()

  const handleSaveRecipe = async (dish: DishResult) => {
    if (saveMutation.isPending) return

    const payload: RecipeSaveRequest = {
      name: dish.name,
      dishImageUrl: dish.imageUrl,
      confidenceMetadata: { confidenceSource: activeResult.confidenceSource },
      servingSize: 1,
      ingredients: dish.ingredients,
      restaurantName: activeResult.restaurantName ?? null,
      restaurantGooglePlacesId: activeResult.restaurantGooglePlacesId ?? null,
    }

    try {
      const saved = await saveMutation.mutateAsync(payload)
      const savedId = saved.data.id
      setSavedDishIds(prev => ({ ...prev, [dish.name]: savedId }))
      toast('Recipe saved')
    } catch {
      toast.error('Failed to save recipe')
    }
  }

  const handleRemoveRecipe = async (dish: DishResult) => {
    const savedId = savedDishIds[dish.name]
    if (!savedId || deleteMutation.isPending) return
    try {
      await deleteMutation.mutateAsync(savedId)
      setSavedDishIds(prev => { const next = { ...prev }; delete next[dish.name]; return next })
      toast('Recipe removed')
    } catch {
      toast.error('Failed to remove recipe')
    }
  }

  const handleRetake = onRetakeProp ?? (() => {
    queryClient.removeQueries({ queryKey: ['scan-result', scanId] })
    queryClient.removeQueries({ queryKey: ['scan-thumbnail', scanId] })
    router.push('/')
    // Signal AppShell to open camera after navigation settles
    setTimeout(() => window.dispatchEvent(new CustomEvent('plately:openCamera')), 300)
  })

  const selectedDish = selectedDishIndex !== null ? (activeResult.dishes[selectedDishIndex] ?? null) : null

  const [bannerDismissed, setBannerDismissed] = useState(false)
  const showRestaurantBanner =
    activeResult.type === 'menu' &&
    !activeResult.restaurantName &&
    !activeResult.restaurantGooglePlacesId &&
    !bannerDismissed

  const [showTip, setShowTip] = useState(false)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (!localStorage.getItem('plately_seen_scan_tip')) setShowTip(true) }, [])

  const dismissTip = () => {
    localStorage.setItem('plately_seen_scan_tip', 'true')
    setShowTip(false)
  }

  // Empty scan result — differentiated copy based on emptyReason
  if (activeResult.dishes.length === 0) {
    return (
      <>
        {showTip && <ScanTipBanner onDismiss={dismissTip} />}
        <EmptyScanState emptyReason={activeResult.emptyReason ?? null} onRetake={handleRetake} />
      </>
    )
  }

  return (
    <div style={{ padding: '0 var(--spacing-4)', paddingBottom: '80px' }}>
      {/* First-time tip banner */}
      {showTip && <ScanTipBanner onDismiss={dismissTip} />}

      {/* Restaurant confirmation banner — shown when restaurant not identified from menu */}
      {showRestaurantBanner && (
        <RestaurantConfirmBanner
          scanId={scanId}
          dishes={activeResult.dishes}
          onDismiss={() => setBannerDismissed(true)}
        />
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--spacing-4) 0' }}>
        <span style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-xs)' }}>
          {activeResult.dishes.length} dish{activeResult.dishes.length !== 1 ? 'es' : ''} found
        </span>
        <button
          onClick={handleRetake}
          style={{ color: 'var(--text-primary)', fontSize: 'var(--text-sm)', background: 'none', border: 'none', cursor: 'pointer', padding: '8px 12px', minHeight: '44px' }}
          aria-label="Retake scan"
        >
          ↺ Retake
        </button>
      </div>

      {/* Partial results banner — only shown when fewer dishes identified than present */}
      {activeResult.totalDishCount && activeResult.dishes.length < activeResult.totalDishCount && (
        <div
          style={{
            background: 'rgba(255,255,255,0.10)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--spacing-4)',
            marginBottom: 'var(--spacing-3)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 'var(--spacing-3)',
          }}
          role="status"
          aria-live="polite"
        >
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', margin: 0, flex: 1 }}>
            We identified {activeResult.dishes.length} of {activeResult.totalDishCount} dishes — lighting may be affecting accuracy. Retake or continue with what we found?
          </p>
          <button
            onClick={handleRetake}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', fontSize: 'var(--text-xs)', padding: '0', flexShrink: 0, minHeight: '44px', minWidth: '44px' }}
            aria-label="Retake scan to improve results"
          >
            ↺ Retake
          </button>
        </div>
      )}

      {/* Dish list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-2)' }}>
        {activeResult.dishes.map((dish, i) => (
          <DishCard key={`${dish.name}-${i}`} dish={dish} onClick={() => setSelectedDishIndex(i)} />
        ))}
      </div>

      {/* Bottom sheet */}
      <DishDetailSheet
        dish={selectedDish}
        open={selectedDish !== null}
        onClose={() => setSelectedDishIndex(null)}
        scanId={scanId}
        dishIndex={selectedDishIndex ?? 0}
        onSave={handleSaveRecipe}
        savedId={selectedDish ? savedDishIds[selectedDish.name] : undefined}
        onRemove={handleRemoveRecipe}
      />
    </div>
  )
}

const EMPTY_REASON_COPY: Record<'image_quality' | 'not_menu' | 'no_dishes_found', string> = {
  image_quality: "The photo was a bit blurry — try again with better lighting or a steadier shot",
  not_menu: "That doesn't look like a menu — try scanning a restaurant menu or food photo",
  no_dishes_found: "We couldn't spot any dishes — try a different angle or better lighting",
}

function EmptyScanState({ emptyReason, onRetake }: { emptyReason: 'image_quality' | 'not_menu' | 'no_dishes_found' | null; onRetake: () => void }) {
  const message = emptyReason && emptyReason in EMPTY_REASON_COPY
    ? EMPTY_REASON_COPY[emptyReason]
    : EMPTY_REASON_COPY.no_dishes_found

  return (
    <div
      role="status"
      style={{ padding: '0 var(--spacing-4)', paddingTop: 'var(--spacing-8)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--spacing-4)' }}
    >
      <p style={{ fontSize: 'var(--text-base)', color: 'var(--text-secondary)', textAlign: 'center', margin: 0 }}>
        {message}
      </p>
      <button
        onClick={onRetake}
        style={{ color: 'var(--text-primary)', fontSize: 'var(--text-sm)', background: 'none', border: 'none', cursor: 'pointer', padding: '8px 12px', minHeight: '44px' }}
        aria-label="Retake scan"
      >
        ↺ Retake
      </button>
    </div>
  )
}

function ScanTipBanner({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.10)',
        borderRadius: 'var(--radius-md)',
        padding: 'var(--spacing-3) var(--spacing-4)',
        marginBottom: 'var(--spacing-3)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 'var(--spacing-3)',
      }}
    >
      <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', margin: 0, flex: 1 }}>
        For best results, hold steady and scan one section at a time.
      </p>
      <button
        onClick={onDismiss}
        aria-label="Dismiss tip"
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', padding: '0', flexShrink: 0, minHeight: '44px', minWidth: '44px' }}
      >
        ✕
      </button>
    </div>
  )
}

type NearbyPlace = { googlePlacesId: string; name: string; address: string }

function RestaurantConfirmBanner({
  scanId,
  dishes,
  onDismiss,
}: {
  scanId: string
  dishes: DishResult[]
  onDismiss: () => void
}) {
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<'idle' | 'gps' | 'text'>('idle')
  const [gpsState, setGpsState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [nearbyPlaces, setNearbyPlaces] = useState<NearbyPlace[]>([])
  const [textQuery, setTextQuery] = useState('')
  const [enriching, setEnriching] = useState(false)
  const { data: textResults, isFetching: textFetching } = useRestaurantSearch(textQuery)

  const confirmRestaurant = async (googlePlacesId: string) => {
    setEnriching(true)
    // Optimistic update — Place ID in cache immediately so save payload picks it up
    queryClient.setQueryData<ScanResult>(['scan-result', scanId], (prev) =>
      prev ? { ...prev, restaurantGooglePlacesId: googlePlacesId } : prev
    )
    try {
      const res = await fetch('/api/scan/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scanId,
          dishes: dishes.map((d) => ({ name: d.name, ingredients: d.ingredients })),
          restaurantGooglePlacesId: googlePlacesId,
        }),
      })
      if (res.ok) {
        const json = await res.json()
        const enriched = json?.data as ScanResult
        if (enriched?.scanId) {
          queryClient.setQueryData<ScanResult>(['scan-result', scanId], (cached) => {
            if (!cached) return cached
            return {
              ...cached,
              confidenceSource: 'multi-source',
              restaurantGooglePlacesId: enriched.restaurantGooglePlacesId ?? googlePlacesId,
              dishes: cached.dishes.map((dish, i) => {
                const enrichedDish = enriched.dishes[i]
                if (!enrichedDish || enrichedDish.name !== dish.name) return dish
                return {
                  ...dish,
                  imageUrl: enrichedDish.imageUrl ?? dish.imageUrl,
                  ingredients: dish.ingredients.map((ing, j) => {
                    const enrichedIng = enrichedDish.ingredients[j]
                    if (!enrichedIng || enrichedIng.name !== ing.name) return ing
                    return { ...ing, confidenceLevel: enrichedIng.confidenceLevel }
                  }),
                }
              }),
            }
          })
        }
      }
    } catch {
      // Silently fail — optimistic Place ID stays in cache
    }
    setEnriching(false)
    onDismiss()
  }

  const requestGps = () => {
    setMode('gps')
    setGpsState('loading')
    navigator.geolocation.getCurrentPosition(
      async ({ coords: { latitude: lat, longitude: lng } }) => {
        try {
          const res = await fetch(`/api/restaurants/nearby-places?lat=${lat}&lng=${lng}&radius=200`)
          if (!res.ok) { setGpsState('error'); return }
          const json = await res.json()
          setNearbyPlaces(json.data ?? [])
          setGpsState('ready')
        } catch {
          setGpsState('error')
        }
      },
      () => setGpsState('error'),
      { timeout: 10_000 }
    )
  }

  const bannerBase = {
    background: 'rgba(255,255,255,0.10)',
    borderRadius: 'var(--radius-md)',
    padding: 'var(--spacing-4)',
    marginBottom: 'var(--spacing-3)',
  }

  const actionBtn = {
    background: 'rgba(255,255,255,0.15)',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-primary)',
    cursor: 'pointer',
    fontSize: 'var(--text-xs)',
    padding: '6px 12px',
    minHeight: '36px',
  }

  const skipBtn = {
    background: 'none' as const,
    border: 'none',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    fontSize: 'var(--text-xs)',
    padding: '6px 4px',
    minHeight: '36px',
  }

  const restaurantRowStyle = {
    background: 'rgba(255,255,255,0.08)',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-primary)',
    cursor: 'pointer',
    fontSize: 'var(--text-sm)',
    padding: '8px 12px',
    textAlign: 'left' as const,
    minHeight: '44px',
    width: '100%',
  }

  if (mode === 'idle') {
    return (
      <div style={bannerBase} role="region" aria-label="Identify restaurant">
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', margin: 0 }}>
          Which restaurant is this from? We&apos;ll show photos of their actual dishes.
        </p>
        <div style={{ display: 'flex', gap: 'var(--spacing-2)', flexWrap: 'wrap', marginTop: 'var(--spacing-3)' }}>
          <button style={actionBtn} onClick={requestGps} aria-label="Use my location to find nearby restaurants">
            Use my location
          </button>
          <button style={actionBtn} onClick={() => setMode('text')} aria-label="Enter restaurant name manually">
            Enter name
          </button>
          <button style={skipBtn} onClick={onDismiss} aria-label="Skip restaurant identification">
            Skip
          </button>
        </div>
      </div>
    )
  }

  if (mode === 'gps') {
    return (
      <div style={bannerBase} role="region" aria-label="Nearby restaurants">
        {gpsState === 'loading' && (
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', margin: 0 }}>
            Finding nearby restaurants…
          </p>
        )}
        {gpsState === 'error' && (
          <>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', margin: 0 }}>
              Could not get your location. Try entering the name instead.
            </p>
            <div style={{ display: 'flex', gap: 'var(--spacing-2)', marginTop: 'var(--spacing-3)' }}>
              <button style={actionBtn} onClick={() => setMode('text')}>Enter name</button>
              <button style={skipBtn} onClick={onDismiss}>Skip</button>
            </div>
          </>
        )}
        {gpsState === 'ready' && nearbyPlaces.length === 0 && (
          <>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', margin: 0 }}>
              No restaurants found nearby. Try entering the name instead.
            </p>
            <div style={{ display: 'flex', gap: 'var(--spacing-2)', marginTop: 'var(--spacing-3)' }}>
              <button style={actionBtn} onClick={() => setMode('text')}>Enter name</button>
              <button style={skipBtn} onClick={onDismiss}>Skip</button>
            </div>
          </>
        )}
        {gpsState === 'ready' && nearbyPlaces.length > 0 && (
          <>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', margin: '0 0 var(--spacing-2) 0' }}>
              Is this one of these?
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-1)' }}>
              {nearbyPlaces.map((place) => (
                <button
                  key={place.googlePlacesId}
                  disabled={enriching}
                  onClick={() => confirmRestaurant(place.googlePlacesId)}
                  style={{ ...restaurantRowStyle, opacity: enriching ? 0.5 : 1 }}
                  aria-label={`Select ${place.name}`}
                >
                  <div style={{ fontWeight: 500 }}>{place.name}</div>
                  {place.address && (
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginTop: '2px' }}>{place.address}</div>
                  )}
                </button>
              ))}
            </div>
            <button style={{ ...skipBtn, marginTop: 'var(--spacing-2)' }} onClick={onDismiss}>None of these</button>
          </>
        )}
      </div>
    )
  }

  // mode === 'text'
  return (
    <div style={bannerBase} role="region" aria-label="Search for restaurant">
      <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', margin: '0 0 var(--spacing-2) 0' }}>
        Enter the restaurant name:
      </p>
      <input
        type="text"
        placeholder="e.g. Trattoria Roma"
        value={textQuery}
        onChange={(e) => setTextQuery(e.target.value)}
        autoFocus
        style={{
          width: '100%',
          background: 'rgba(255,255,255,0.08)',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 'var(--radius-sm)',
          color: 'var(--text-primary)',
          fontSize: 'var(--text-sm)',
          padding: '8px 12px',
          outline: 'none',
          boxSizing: 'border-box',
        }}
        aria-label="Restaurant name search"
      />
      {textFetching && (
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', margin: 'var(--spacing-2) 0 0 0' }}>
          Searching…
        </p>
      )}
      {!textFetching && textQuery.length >= 3 && textResults && textResults.length === 0 && (
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', margin: 'var(--spacing-2) 0 0 0' }}>
          No restaurants found.
        </p>
      )}
      {textResults && textResults.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-1)', marginTop: 'var(--spacing-2)' }}>
          {textResults.map((r) => (
            <button
              key={r.googlePlacesId}
              disabled={enriching}
              onClick={() => confirmRestaurant(r.googlePlacesId)}
              style={{ ...restaurantRowStyle, opacity: enriching ? 0.5 : 1 }}
              aria-label={`Select ${r.name}`}
            >
              <div style={{ fontWeight: 500 }}>{r.name}</div>
              {r.address && (
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginTop: '2px' }}>{r.address}</div>
              )}
            </button>
          ))}
        </div>
      )}
      <button style={{ ...skipBtn, marginTop: 'var(--spacing-2)' }} onClick={onDismiss}>Skip</button>
    </div>
  )
}

export function DishCard({ dish, onClick }: { dish: DishResult; onClick: () => void }) {
  return (
    <GlassCard
      variant="compact"
      onClick={onClick}
      style={{ cursor: 'pointer', padding: 'var(--spacing-3)', display: 'flex', gap: 'var(--spacing-3)', alignItems: 'center' }}
    >
      {/* Thumbnail: 64×64pt — imageUrl is null in 2.3 (enriched in Story 2.4) */}
      {dish.imageUrl ? (
        <img src={dish.imageUrl} alt={formatDishAlt(dish.name, dish.description)} style={{ width: '64px', height: '64px', borderRadius: 'var(--radius-xs)', objectFit: 'cover', flexShrink: 0 }} />
      ) : (
        <div style={{ width: '64px', height: '64px', borderRadius: 'var(--radius-xs)', background: 'rgba(255,255,255,0.08)', flexShrink: 0 }} aria-hidden="true" />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 'var(--text-base)', color: 'var(--text-primary)', fontWeight: 500 }}>{dish.name}</div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dish.description}</div>
        {dish.calorieEstimate !== null && (
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginTop: '2px' }}>{dish.calorieEstimate} cal</div>
        )}
      </div>
    </GlassCard>
  )
}
