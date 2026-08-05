'use client'

import { useQuery } from '@tanstack/react-query'
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

export function useKanaSheet(userId: string | undefined) {
  return useQuery({
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
}
