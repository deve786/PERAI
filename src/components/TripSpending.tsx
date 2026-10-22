import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  linkExpenses,
  listExpenses,
  listLinkedExpenses,
  listLinkedExpenseIds,
  unlinkExpense,
  type ExpenseRow,
} from '@/expense/db';
import {
  categoryBreakdown,
  suggestExpenses,
  totalsByCurrency,
  type LinkableExpense,
} from '@/expense/tripSpending';
import { fmtMoney } from '@/expense/stats';
import { getSetting } from '@/expense/db';
import { logFail } from '@/log';
import { useTheme } from '@/ThemeContext';
import { FONTS, RADIUS, type Colors } from '@/theme';
import type { Memory } from '@/types';

const asLinkable = (row: ExpenseRow): LinkableExpense => ({
  id: row.id,
  date: row.date,
  amount: row.amount,
  cat_name: row.cat_name,
  cat_color: row.cat_color,
  refund_amount: row.refund_amount,
});

/**
 * What a trip cost.
 *
 * Shown for an entry that covers a span of days: the spending already tied to
 * it, and whatever else happened during those days that is not yet tied to
 * anything. The two databases are separate, so this reads the expense side
 * directly and joins in JavaScript rather than across a connection.
 */
export function TripSpending({ memory }: { memory: Memory }) {
  const { colors, type } = useTheme();
  const styles = makeStyles(colors);

  const [linked, setLinked] = useState<ExpenseRow[]>([]);
  const [suggested, setSuggested] = useState<ExpenseRow[]>([]);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [symbol, setSymbol] = useState('₹');
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState(false);

  const from = memory.eventDate.slice(0, 10);
  const to = (memory.endDate ?? memory.eventDate).slice(0, 10);

  const load = useCallback(async () => {
    try {
      const [already, inRange, linkedIds, currency] = await Promise.all([
        listLinkedExpenses(memory.id),
        listExpenses(from, to),
        listLinkedExpenseIds(),
        getSetting('symbol', '₹'),
      ]);
      setLinked(already);
      setSymbol(currency || '₹');

      const offers = suggestExpenses(inRange.map(asLinkable), { from, to }, linkedIds);
      const byId = new Map(inRange.map((row) => [row.id, row]));
      const rows = offers.map((offer) => byId.get(offer.id)).filter(Boolean) as ExpenseRow[];
      setSuggested(rows);
      // Everything in the span is part of the trip until you say otherwise.
      setChosen(new Set(rows.map((row) => row.id)));
    } catch (err) {
      logFail('Could not read trip spending', err instanceof Error ? err.message : String(err));
    }
  }, [memory.id, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const totals = totalsByCurrency(linked.map(asLinkable), symbol);
  const breakdown = categoryBreakdown(linked.map(asLinkable));

  async function linkChosen() {
    if (chosen.size === 0 || busy) return;
    setBusy(true);
    try {
      await linkExpenses(memory.id, [...chosen]);
      await load();
    } catch (err) {
      logFail('Could not link spending', err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function unlink(expenseId: string) {
    try {
      await unlinkExpense(memory.id, expenseId);
      await load();
    } catch (err) {
      logFail('Could not unlink spending', err instanceof Error ? err.message : String(err));
    }
  }

  const toggle = (id: string) =>
    setChosen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <View style={styles.card}>
      <Text style={styles.heading}>Spending</Text>

      {totals.length === 0 ? (
        <Text style={type.fine}>Nothing linked to this yet.</Text>
      ) : (
        <Pressable
          onPress={() => setShowAll((open) => !open)}
          accessibilityRole="button"
          accessibilityState={{ expanded: showAll }}
          style={styles.summary}
        >
          {/* Currencies are never added together — they sit side by side. */}
          {totals.map((total) => (
            <Text key={total.currency} style={[type.figure, styles.total]}>
              {fmtMoney(total.total, total.currency)}
              <Text style={type.fine}>
                {'  '}
                {total.count} {total.count === 1 ? 'expense' : 'expenses'}
              </Text>
            </Text>
          ))}
          {breakdown.length > 0 ? (
            <Text style={type.fine}>
              {breakdown
                .slice(0, 4)
                .map((slice) => `${slice.name} ${fmtMoney(slice.total, symbol)}`)
                .join(' · ')}
            </Text>
          ) : null}
          <View style={styles.moreRow}>
            <Text style={styles.link}>{showAll ? 'Hide' : 'Show each'}</Text>
            <Ionicons name={showAll ? 'chevron-up' : 'chevron-down'} size={14} color={colors.moss} />
          </View>
        </Pressable>
      )}

      {showAll
        ? linked.map((row) => (
            <View key={row.id} style={styles.row}>
              <Text style={[type.body, styles.rowText]} numberOfLines={1}>
                {row.note || row.cat_name}
              </Text>
              <Text style={styles.amount}>{fmtMoney(row.amount, symbol)}</Text>
              <Pressable onPress={() => void unlink(row.id)} hitSlop={8} accessibilityRole="button">
                <Text style={styles.unlink}>Unlink</Text>
              </Pressable>
            </View>
          ))
        : null}

      {suggested.length > 0 ? (
        <View style={styles.suggestions}>
          <Text style={styles.subheading}>Spent during these days · {suggested.length}</Text>
          {suggested.map((row) => {
            const picked = chosen.has(row.id);
            return (
              <Pressable
                key={row.id}
                onPress={() => toggle(row.id)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: picked }}
                style={styles.row}
              >
                <Ionicons
                  name={picked ? 'checkbox' : 'square-outline'}
                  size={20}
                  color={picked ? colors.moss : colors.mist}
                />
                <Text style={[type.body, styles.rowText]} numberOfLines={1}>
                  {row.note || row.cat_name}
                </Text>
                <Text style={styles.amount}>{fmtMoney(row.amount, symbol)}</Text>
              </Pressable>
            );
          })}
          <Pressable
            onPress={() => void linkChosen()}
            disabled={chosen.size === 0 || busy}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.linkButton,
              (chosen.size === 0 || busy) && styles.disabled,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.linkButtonText}>
              {busy ? 'Linking…' : `Link ${chosen.size} to this`}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    card: {
      gap: 8,
      backgroundColor: colors.surface,
      borderRadius: RADIUS.card,
      borderWidth: 1,
      borderColor: colors.rule,
      padding: 14,
    },
    heading: { fontFamily: FONTS.sansSemi, fontSize: 16, color: colors.ink },
    subheading: { fontFamily: FONTS.sansSemi, fontSize: 14, color: colors.graphite, marginBottom: 2 },
    summary: { gap: 4 },
    total: { color: colors.ink, fontSize: 17 },
    moreRow: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 32 },
    link: { fontFamily: FONTS.sansSemi, fontSize: 14, color: colors.moss },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      minHeight: 44,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.rule,
    },
    rowText: { flex: 1, color: colors.ink },
    amount: { fontFamily: FONTS.monoMedium, fontSize: 14, color: colors.ink },
    unlink: { fontFamily: FONTS.sansSemi, fontSize: 14, color: colors.graphite },
    suggestions: { marginTop: 6, gap: 0 },
    linkButton: {
      marginTop: 10,
      minHeight: 48,
      borderRadius: RADIUS.button,
      backgroundColor: colors.mossFill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    linkButtonText: { fontFamily: FONTS.sansSemi, fontSize: 16, color: colors.onAccent },
    disabled: { opacity: 0.4 },
    pressed: { opacity: 0.7 },
  });
}
