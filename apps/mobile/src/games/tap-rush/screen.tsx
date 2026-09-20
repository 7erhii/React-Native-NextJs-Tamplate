/**
 * Tap Rush — the reference game.
 *
 * Its job is not to be fun. Its job is to be the smallest complete demonstration
 * that a game can persist versioned, identity-scoped progress while knowing
 * nothing about storage, authentication, or sync. Note what is absent: no import
 * of any adapter, no Supabase, no AsyncStorage, no conditional on persistence
 * mode. Everything persistent goes through `useSaveState`.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Badge, Body, Button, Card, Heading, KeyValue, Row, Subheading } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useSaveState } from '@/platform/use-save-state';
import { useTheme } from '@/hooks/use-theme';
import { tapRush } from './definition';

const ROUND_SECONDS = 15;

type Phase = 'idle' | 'playing' | 'over';

interface TargetPosition {
  left: number;
  top: number;
}

function randomPosition(): TargetPosition {
  // Percentages keep the target inside the arena on any screen size, with a
  // margin so it never lands half off the edge.
  return { left: 8 + Math.random() * 74, top: 8 + Math.random() * 74 };
}

export function TapRushScreen() {
  const theme = useTheme();
  const { data, save, status, revision } = useSaveState(tapRush);

  const [phase, setPhase] = useState<Phase>('idle');
  const [score, setScore] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(ROUND_SECONDS);
  const [target, setTarget] = useState<TargetPosition>(randomPosition);
  const [lastRoundScore, setLastRoundScore] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  const finishRound = useCallback(
    (finalScore: number) => {
      stopTimer();
      setPhase('over');
      setLastRoundScore(finalScore);

      // The only persistence call in the game. Whether this lands in AsyncStorage
      // or in Postgres is decided by configuration the game never reads.
      void save((previous) => ({
        bestScore: Math.max(previous.bestScore, finalScore),
        roundsPlayed: previous.roundsPlayed + 1,
        totalTaps: previous.totalTaps + finalScore,
        lastPlayedAt: new Date().toISOString(),
      }));
    },
    [save, stopTimer],
  );

  const startRound = useCallback(() => {
    setScore(0);
    setSecondsLeft(ROUND_SECONDS);
    setTarget(randomPosition());
    setPhase('playing');
  }, []);

  useEffect(() => {
    if (phase !== 'playing') return undefined;

    let remaining = ROUND_SECONDS;
    timerRef.current = setInterval(() => {
      remaining -= 1;
      setSecondsLeft(remaining);
      if (remaining <= 0) {
        // Read the score through the setter so the timer never closes over a
        // stale value.
        setScore((current) => {
          finishRound(current);
          return current;
        });
      }
    }, 1000);

    return stopTimer;
  }, [finishRound, phase, stopTimer]);

  useEffect(() => stopTimer, [stopTimer]);

  const handleHit = useCallback(() => {
    setScore((current) => current + 1);
    setTarget(randomPosition());
  }, []);

  const isNewRecord = phase === 'over' && lastRoundScore > 0 && lastRoundScore >= data.bestScore;

  return (
    <View style={styles.container}>
      <Row style={styles.headerRow}>
        <View style={styles.headerStat}>
          <Body muted>Score</Body>
          <Heading>{score}</Heading>
        </View>
        <View style={styles.headerStat}>
          <Body muted>Time</Body>
          <Heading>{secondsLeft}s</Heading>
        </View>
        <View style={styles.headerStat}>
          <Body muted>Best</Body>
          <Heading>{data.bestScore}</Heading>
        </View>
      </Row>

      <View style={[styles.arena, { backgroundColor: theme.backgroundElement }]}>
        {phase === 'playing' ? (
          <Pressable
            accessibilityLabel="Target"
            accessibilityRole="button"
            onPress={handleHit}
            style={[styles.target, { left: `${target.left}%`, top: `${target.top}%` }]}
          >
            <Text style={styles.targetIcon}>{tapRush.icon}</Text>
          </Pressable>
        ) : (
          <View style={styles.arenaMessage}>
            {phase === 'idle' ? (
              <>
                <Subheading>Ready?</Subheading>
                <Body muted>Tap the target as often as you can in {ROUND_SECONDS} seconds.</Body>
              </>
            ) : (
              <>
                <Subheading>{lastRoundScore} taps</Subheading>
                {isNewRecord ? (
                  <Badge label="New personal best" tone="positive" />
                ) : (
                  <Body muted>Your best is {data.bestScore}.</Body>
                )}
              </>
            )}
          </View>
        )}
      </View>

      {phase !== 'playing' && (
        <Button label={phase === 'idle' ? 'Start' : 'Play again'} onPress={startRound} />
      )}

      <Card>
        <Subheading>Saved progress</Subheading>
        <KeyValue label="Best score" value={String(data.bestScore)} />
        <KeyValue label="Rounds played" value={String(data.roundsPlayed)} />
        <KeyValue label="Total taps" value={String(data.totalTaps)} />
        <KeyValue
          label="Last played"
          value={data.lastPlayedAt ? new Date(data.lastPlayedAt).toLocaleString() : 'never'}
        />
        {/* Surfaced because this is a reference implementation: it shows the save
            revision advancing, which is what conflict resolution compares. */}
        <KeyValue label="Save revision" value={revision === 0 ? 'not saved yet' : String(revision)} />
        <KeyValue label="Status" value={status} />
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.three },
  headerRow: { justifyContent: 'space-between' },
  headerStat: { gap: 2, minWidth: 72 },
  arena: {
    height: 320,
    borderRadius: 20,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  arenaMessage: { alignItems: 'center', gap: Spacing.two, padding: Spacing.three },
  target: { position: 'absolute', padding: Spacing.two },
  targetIcon: { fontSize: 46 },
});
