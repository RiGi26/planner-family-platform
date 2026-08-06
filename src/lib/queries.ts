'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import { supabase } from './supabase-client'
import type { CardStateRow } from './fsrs'
import type { Point } from './stroke-score'

/**
 * Reads. Every one of them is guarded by RLS rather than by anything here — with a
 * static export there is no server to check, so these queries are written as if the
 * caller were hostile, because from the database's point of view they might be.
 */

export type Profile = {
  id: string
  display_name: string
  level_current: string
  daily_minutes_target: number
  writing_kana_enabled: boolean
  writing_kanji_enabled: boolean
  timezone: string
}

export type KanaSheetRow = {
  item_id: string
  strokes: Point[][]
  written_at: string
}

export type Goal = {
  id: string
  target_level: string
  /** `YYYY-MM-DD`. Read it with `parseExamDate`, never `new Date(iso)`. */
  target_exam_date: string
  /** The pace agreed to when this goal was set. Null for goals predating 0007. */
  baseline_new_per_day: number | null
}

/**
 * The one active goal, or null when onboarding has not happened yet.
 *
 * `maybeSingle()` rather than `single()`: "no goal yet" is the expected state for
 * a new account, not an error, and RequireGoal has to be able to tell the
 * difference between "there is none" and "we could not ask".
 */
export function useGoal(userId: string | undefined) {
  return useQuery({
    queryKey: ['goal', userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<Goal | null> => {
      const { data, error } = await supabase
        .from('goals')
        .select('id, target_level, target_exam_date, baseline_new_per_day')
        .eq('user_id', userId!)
        .eq('is_active', true)
        .maybeSingle()
      if (error) throw error
      return data
    },
  })
}

export function useProfile(userId: string | undefined) {
  return useQuery({
    queryKey: ['profile', userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<Profile | null> => {
      const { data, error } = await supabase
        .from('profiles')
        .select(
          'id, display_name, level_current, daily_minutes_target, writing_kana_enabled, writing_kanji_enabled, timezone',
        )
        .eq('id', userId!)
        .maybeSingle()
      if (error) throw error
      return data
    },
  })
}

export function useCardStates(userId: string | undefined) {
  return useQuery({
    queryKey: ['card_states', userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<CardStateRow[]> => {
      const { data, error } = await supabase
        .from('card_states')
        .select('*')
        .eq('user_id', userId!)
      if (error) throw error
      return (data ?? []) as CardStateRow[]
    },
  })
}

/**
 * The sheet as best known: server rows with local Dexie rows layered on top.
 *
 * The server alone is not enough, because a save is local-first — `recordKanaCell`
 * lands in Dexie immediately while `pushPending()` races the refetch. Reading only
 * the server left the row strip one cell behind and, worse, fed the same stale map
 * into the writing screen's pick of the next unwritten cell — which after the last
 * cell of a row could point BACK at one already written. Local wins per item: a
 * local row is always at least as new as the server's copy of it. Server rows fill
 * in what a fresh device has not pulled yet.
 */
export function useKanaSheet(userId: string | undefined) {
  const server = useQuery({
    queryKey: ['kana_sheet', userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<Map<string, Point[][]>> => {
      const { data, error } = await supabase
        .from('kana_sheet')
        .select('item_id, strokes, written_at')
        .eq('user_id', userId!)
      if (error) throw error
      const map = new Map<string, Point[][]>()
      for (const row of (data ?? []) as KanaSheetRow[]) {
        map.set(row.item_id, row.strokes)
      }
      return map
    },
  })

  const local = useLiveQuery(
    () => (userId ? db.kanaSheet.where('user_id').equals(userId).toArray() : []),
    [userId],
  )

  const data = useMemo(() => {
    if (!server.data && (!local || local.length === 0)) return server.data
    const map = new Map(server.data ?? [])
    for (const row of local ?? []) map.set(row.item_id, row.strokes as Point[][])
    return map
  }, [server.data, local])

  return { ...server, data }
}
