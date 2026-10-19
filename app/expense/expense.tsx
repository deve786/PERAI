import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { guessCategoryWithAI } from '@/expense/ai/categorize';
import { scanReceiptWithAI } from '@/expense/ai/ocr';
import { generateExpenseTitleWithAI } from '@/expense/ai/title';
import {
  METHODS, deleteExpense, findOrCreateCategory, findOrCreateTaggedUser, findOrCreateTicketType, getExpense,
  listCategories, listExpenseItems, listTaggedUsers, listTicketTypes, saveExpense, saveExpenseItems, setExpenseRefund,
  type Category, type ExpenseItem as ExpenseItemRow, type TaggedUser, type TicketType,
} from '@/expense/db';
import { listAccounts, type AccountItem } from '@/expense/accountsDb';
import { fromStr, prettyDate, toStr, todayStr } from '@/expense/dates';
import { noteBudgetCrossing } from '@/expense/budgetAlerts';
import { numerals, radius, useTheme } from '@/expense/theme';
import { Button, Chip, ConfirmDialog, Divider, Field, Header, IconDot, Money, Row, Screen, T } from '@/expense/ui';
import { showDialog } from '@/dialogStore';

type DraftItem = { name: string; qty: string; amount: string };
type Mode = 'view' | 'edit';

const parseAmt = (s: string) => parseFloat(s.replace(/,/g, ''));
const round2 = (n: number) => Math.round(n * 100) / 100;
const lineTotal = (it: DraftItem) => (parseAmt(it.qty) || 1) * (parseAmt(it.amount) || 0);

/** Keyword -> default category name. First match wins; falls back to "Other" when nothing matches. */
const CATEGORY_KEYWORDS: [string, string[]][] = [
  ['Food', ['food', 'restaurant', 'pizza', 'coffee', 'cafe', 'lunch', 'dinner', 'breakfast', 'snack', 'swiggy', 'zomato', 'grocery', 'groceries']],
  ['Transport', ['uber', 'ola', 'taxi', 'cab', 'bus', 'train', 'metro', 'fuel', 'petrol', 'diesel', 'parking', 'auto']],
  ['Shopping', ['amazon', 'flipkart', 'shopping', 'clothes', 'shoes', 'mall']],
  ['Bills', ['electricity', 'water bill', 'internet', 'wifi', 'phone bill', 'recharge', 'bill']],
  ['Rent', ['rent']],
  ['Health', ['doctor', 'medicine', 'pharmacy', 'hospital', 'clinic', 'medical']],
  ['Entertainment', ['movie', 'netflix', 'spotify', 'cinema', 'concert', 'game']],
];

function guessCategoryName(title: string): string | null {
  const t = title.toLowerCase();
  if (!t.trim()) return null;
  for (const [name, words] of CATEGORY_KEYWORDS) {
    if (words.some((w) => t.includes(w))) return name;
  }
  return 'Other';
}

export default function ExpenseForm() {
  const { id, mode: modeParam, scan, date: dateParam } = useLocalSearchParams<{ id?: string; mode?: string; scan?: string; date?: string }>();
  const editId = id || undefined;
  const router = useRouter();
  const { c, symbol } = useTheme();

  const [mode, setMode] = useState<Mode>(editId ? (modeParam === 'edit' ? 'edit' : 'view') : 'edit');
  const [cats, setCats] = useState<Category[]>([]);
  const [amount, setAmount] = useState('');
  const [items, setItems] = useState<DraftItem[]>([]);
  const [viewItems, setViewItems] = useState<ExpenseItemRow[]>([]);
  const [catId, setCatId] = useState<string | null>(null);
  const [date, setDate] = useState(dateParam || todayStr());
  const [note, setNote] = useState('');
  const [notes, setNotes] = useState('');
  const [method, setMethod] = useState<string>('UPI');
  const [bankAccounts, setBankAccounts] = useState<AccountItem[]>([]);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [refunded, setRefunded] = useState(false);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundAccountId, setRefundAccountId] = useState<string | null>(null);
  const [peopleCount, setPeopleCount] = useState('');
  const [refundPeopleCount, setRefundPeopleCount] = useState('');
  const [subCategory, setSubCategory] = useState('');
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([]);
  const [showNewTicketTypeInput, setShowNewTicketTypeInput] = useState(false);
  const [newTicketTypeName, setNewTicketTypeName] = useState('');
  const [userTag, setUserTag] = useState('');
  const [savedUsers, setSavedUsers] = useState<TaggedUser[]>([]);
  const [showNewUserInput, setShowNewUserInput] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const [customCat, setCustomCat] = useState('');
  const [aiSuggestedCat, setAiSuggestedCat] = useState(false); // true when customCat was filled by AI
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [aiGuessing, setAiGuessing] = useState(false);
  const [aiTitleGenerating, setAiTitleGenerating] = useState(false);
  const [ocrScanning, setOcrScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  // Stops auto-categorising from title once the user has picked one themselves.
  const catAutoPick = useRef(true);
  const aiDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The in-flight AI categorisation call, if any — Save awaits this so a
  // quick type-then-save doesn't race past it and miss the result.
  const aiPending = useRef<Promise<void> | null>(null);
  // Bumped on every keystroke so a slow AI reply for an earlier title can't
  // land after the user has kept typing (or picked a category by hand).
  const aiSeq = useRef(0);
  // Mirrors of state that Save needs to read *after* awaiting aiPending —
  // by then the closure's own catId/cats consts are stale, since React
  // state doesn't update mid-await within the same function call.
  const catIdRef = useRef(catId);
  const catsRef = useRef(cats);
  useEffect(() => { catIdRef.current = catId; }, [catId]);
  useEffect(() => { catsRef.current = cats; }, [cats]);

  useEffect(() => {
    (async () => {
      const [cs, users, accounts, types] = await Promise.all([
        listCategories(), listTaggedUsers(), listAccounts({ type: 'bank' }), listTicketTypes(),
      ]);
      setCats(cs);
      setSavedUsers(users);
      setBankAccounts(accounts);
      setTicketTypes(types);
      if (editId) {
        const e = await getExpense(editId);
        if (e) {
          setAmount(String(e.amount));
          setCatId(e.category_id);
          setDate(e.date);
          setNote(e.note);
          setNotes(e.notes);
          setMethod(e.method);
          setAccountId(e.account_id ?? null);
          setRefunded(e.cancelled === 1);
          setRefundAmount(e.refund_amount != null ? String(e.refund_amount) : '');
          setRefundAccountId(e.refund_account_id ?? null);
          setPeopleCount(e.people_count != null ? String(e.people_count) : '');
          setRefundPeopleCount(e.refund_people_count != null ? String(e.refund_people_count) : '');
          if (e.user_tag) setUserTag(e.user_tag);
          if (e.sub_category) setSubCategory(e.sub_category);
        }
        const existing = await listExpenseItems(editId);
        setViewItems(existing);
        if (existing.length) {
          setItems(existing.map((it) => ({ name: it.name, qty: String(it.quantity), amount: String(it.amount) })));
        }
        // Left at its default (true): opening an existing expense doesn't
        // touch the title via onChangeNote at all (setNote above is direct),
        // so auto-pick can't fire on load — but it should still resume if
        // the user then edits the title themselves.
      } else if (cs.length) {
        setCatId(cs[0].id);
      }
    })();
  }, [editId]);

  useEffect(() => {
    return () => {
      if (aiDebounce.current) clearTimeout(aiDebounce.current);
    };
  }, []);

  async function runAiTitleGeneration() {
    const hasValidItems = items.some((it) => it.name.trim().length > 0);
    const hasCategory = cat && cat.name !== 'Other';
    const hasNotes = notes.trim().length > 0;
    const hasAmount = hasItems ? itemsTotal > 0 : parseAmt(amount) > 0;

    if (!hasValidItems && !hasCategory && !hasNotes && !hasAmount && !note.trim()) {
      showDialog({
        title: 'Details needed',
        message: 'Add items, notes, or select a category first so AI can generate an expense title.',
      });
      return;
    }

    setAiTitleGenerating(true);
    try {
      const generatedTitle = await generateExpenseTitleWithAI({
        items,
        category: cat?.name,
        notes: notes.trim(),
        amount: hasItems ? itemsTotal : amount,
        userTag: userTag.trim(),
        currentTitle: note.trim(),
      });
      if (generatedTitle) {
        onChangeNote(generatedTitle);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      } else {
        showDialog({
        title: 'Could not generate title',
        message: 'AI was unable to generate a title from the current details.',
      });
      }
    } catch (e) {
      showDialog({ title: 'AI Error', message: String(e instanceof Error ? e.message : e) });
    } finally {
      setAiTitleGenerating(false);
    }
  }

  function fallBackToOther(seq: number) {
    if (seq !== aiSeq.current || !catAutoPick.current) return;
    const other = catsRef.current.find((k) => k.name === 'Other');
    if (other) setCatId(other.id);
  }

  async function runAiGuess(t: string, seq: number) {
    setAiGuessing(true);
    try {
      const name = await guessCategoryWithAI(t, catsRef.current.map((k) => k.name));
      if (seq !== aiSeq.current || !catAutoPick.current) return;
      if (!name || name.toLowerCase() === 'other') {
        // Nothing fit, by keyword or by AI — land on the real "Other"
        // category (not whatever was left selected before), so the "name a
        // new category" field reliably appears and Save can act on it.
        fallBackToOther(seq);
        return;
      }

      const existing = catsRef.current.find((k) => k.name.toLowerCase() === name.toLowerCase());
      if (existing) {
        setCatId(existing.id);
        return;
      }

      // The AI suggested a brand-new category — don't create it silently.
      // Instead: select "Other" so the custom-category field appears, then
      // pre-fill it with the AI's suggestion so the user can review/tweak it
      // before it gets saved to the categories table on Save.
      fallBackToOther(seq);
      if (seq !== aiSeq.current || !catAutoPick.current) return;
      setCustomCat(name);
      setAiSuggestedCat(true);
    } finally {
      if (seq === aiSeq.current) setAiGuessing(false);
    }
  }

  function onChangeNote(t: string) {
    setNote(t);
    aiSeq.current += 1;
    if (aiDebounce.current) clearTimeout(aiDebounce.current);
    aiDebounce.current = null;
    setAiGuessing(false);
    // Clear any previous AI-suggested category name when the title changes,
    // so a stale suggestion from an earlier title doesn't linger.
    if (aiSuggestedCat) { setCustomCat(''); setAiSuggestedCat(false); }

    if (!catAutoPick.current) return;

    const guess = guessCategoryName(t);
    if (!guess) return;

    // Only use the keyword match directly when it names a SPECIFIC category
    // (not the "Other" fallback). When the keyword list falls back to "Other"
    // it means it doesn't recognise the title — we still need the AI to find
    // something more specific. Returning early here was the bug: it matched
    // the real "Other" category row and skipped the AI debounce entirely.
    if (guess !== 'Other') {
      const match = cats.find((k) => k.name === guess);
      if (match) {
        setCatId(match.id);
        return; // Specific keyword hit — no AI needed.
      }
    }

    // Either the keyword list said "Other" (unknown title), or it named a
    // category the user has since removed. Select "Other" as a safe interim
    // pick while the AI looks for something more specific after typing pauses.
    const other = cats.find((k) => k.name === 'Other');
    if (other) setCatId(other.id);
    const seq = aiSeq.current;
    aiDebounce.current = setTimeout(() => {
      aiDebounce.current = null;
      aiPending.current = runAiGuess(t, seq);
    }, 600);
  }

  function onPickCategory(id: string) {
    catAutoPick.current = false;
    aiSeq.current += 1;
    if (aiDebounce.current) clearTimeout(aiDebounce.current);
    setAiGuessing(false);
    setCatId(id);
    // Clear the AI suggestion when the user manually picks a category.
    if (aiSuggestedCat) { setCustomCat(''); setAiSuggestedCat(false); }
  }

  const hasItems = items.length > 0;
  const itemsTotal = items.reduce((s, it) => s + lineTotal(it), 0);
  const manualValue = parseAmt(amount);
  const value = hasItems ? itemsTotal : manualValue;
  // A row with nothing typed yet is just not filled in — it shouldn't block
  // saving the items that already have an amount.
  const itemsValid = !hasItems || items.some((it) => lineTotal(it) > 0);
  const isOther = cats.find((k) => k.id === catId)?.name === 'Other';
  const valid = !isNaN(value) && value > 0 && catId !== null && itemsValid;
  const cat = cats.find((k) => k.id === catId);

  function startItems() {
    // Seed with just the one row carrying forward whatever was already typed —
    // "Add item" grows the list from here, so Save isn't blocked by a second,
    // still-empty row the user never asked for.
    const seed = !isNaN(manualValue) && manualValue > 0 ? amount : '';
    setItems([{ name: '', qty: '1', amount: seed }]);
  }
  function clearItems() {
    if (itemsTotal > 0) setAmount(String(itemsTotal));
    setItems([]);
  }
  function addItem() {
    setItems((prev) => [...prev, { name: '', qty: '1', amount: '' }]);
  }
  function updateItem(i: number, patch: Partial<DraftItem>) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }
  function removeItem(i: number) {
    setItems((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function onSave() {
    if (!valid || catId === null) return;

    // A category guess may still be debouncing or in flight for the current
    // title — run it now instead of waiting out the timer, then wait for it,
    // so a quick type-then-save doesn't miss the AI's result.
    if (aiDebounce.current) {
      clearTimeout(aiDebounce.current);
      aiDebounce.current = null;
      aiPending.current = runAiGuess(note, aiSeq.current);
    }
    if (aiPending.current) {
      setSaving(true);
      await aiPending.current;
    }

    const finalCategoryId = catIdRef.current;
    if (finalCategoryId === null) { setSaving(false); return; }
    const isOtherNow = catsRef.current.find((k) => k.id === finalCategoryId)?.name === 'Other';
    const custom = isOtherNow ? customCat.trim() : '';
    const finalCatId = custom ? await findOrCreateCategory(custom) : finalCategoryId;
    const finalUserTag = (userTag || newUserName).trim();
    if (finalUserTag) {
      await findOrCreateTaggedUser(finalUserTag);
    }
    const isTicket = cat?.name === 'Ticket';
    const finalSubCategory = (isTicket ? (subCategory || newTicketTypeName) : '').trim();
    if (isTicket && finalSubCategory) {
      await findOrCreateTicketType(finalSubCategory);
    }
    const newId = await saveExpense({
      id: editId, amount: round2(value), category_id: finalCatId, date,
      note: note.trim(), notes: notes.trim(), method,
      user_tag: finalUserTag,
      // Only a UPI payment is tied to the bank it drew from — switching away
      // from UPI drops the link rather than leaving a stale one behind.
      account_id: method === 'UPI' ? accountId : null,
      people_count: isTicket && parseAmt(peopleCount) > 0 ? Math.round(parseAmt(peopleCount)) : null,
      sub_category: finalSubCategory,
    });
    const cleanItems = hasItems
      ? items
          .map((it) => ({ name: it.name.trim(), quantity: parseAmt(it.qty) || 1, amount: round2(parseAmt(it.amount) || 0) }))
          .filter((it) => it.quantity * it.amount > 0)
      : [];
    await saveExpenseItems(newId, cleanItems);
    // Only a Ticket carries a refund; the field is hidden for anything else,
    // so there's nothing to set (or clear) on another category.
    if (isTicket) {
      const parsedRefund = round2(parseAmt(refundAmount) || 0);
      await setExpenseRefund(
        newId,
        refunded && parsedRefund > 0
          ? {
              amount: parsedRefund,
              accountId: refundAccountId,
              peopleCount: parseAmt(refundPeopleCount) > 0 ? Math.round(parseAmt(refundPeopleCount)) : null,
            }
          : null
      );
    }
    // Shown on Home, since this screen closes itself below.
    await noteBudgetCrossing(finalCatId, round2(value), symbol);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    router.back();
  }

  const processImage = async (base64: string, mimeType = 'image/jpeg') => {
    setOcrScanning(true);
    try {
      const parsed = await scanReceiptWithAI(base64, mimeType);
      if (parsed.totalAmount > 0) {
        setAmount(String(parsed.totalAmount));
      }
      if (parsed.merchant) {
        setNote(parsed.merchant);
      }
      if (parsed.date) {
        setDate(parsed.date);
      }
      const matched = cats.find((ct) => ct.name.toLowerCase() === parsed.category.toLowerCase());
      if (matched) {
        setCatId(matched.id);
        setCustomCat('');
      } else {
        setCustomCat(parsed.category);
        setCatId(null);
      }
      if (parsed.items && parsed.items.length > 0) {
        setItems(
          parsed.items.map((it) => ({
            name: it.name,
            qty: String(it.quantity || 1),
            amount: String(it.amount),
          }))
        );
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (err) {
      showDialog({
        title: 'Scan failed',
        message: err instanceof Error ? err.message : 'Could not analyze receipt.',
      });
    } finally {
      setOcrScanning(false);
    }
  };

  const captureFromCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      showDialog({
        title: 'Permission needed',
        message: 'Camera access is required to take photos of receipts.',
      });
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      base64: true,
    });
    if (!result.canceled && result.assets && result.assets[0]?.base64) {
      await processImage(result.assets[0].base64, result.assets[0].mimeType || 'image/jpeg');
    }
  };

  const pickFromGallery = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      base64: true,
    });
    if (!result.canceled && result.assets && result.assets[0]?.base64) {
      await processImage(result.assets[0].base64, result.assets[0].mimeType || 'image/jpeg');
    }
  };

  const handleScanReceipt = () => {
    showDialog({
      title: 'Scan receipt or bill',
      message: 'Choose how you want to capture the receipt:',
      actions: [
        { label: 'Cancel', cancel: true },
        { label: 'Choose from gallery', onPress: () => void pickFromGallery() },
        { label: 'Take photo', onPress: () => void captureFromCamera() },
      ],
    });
  };

  useEffect(() => {
    if (scan === '1' && !editId) {
      const t = setTimeout(() => {
        handleScanReceipt();
      }, 400);
      return () => clearTimeout(t);
    }
  }, [scan, editId]);

  async function confirmDelete() {
    if (!editId) return;
    setConfirmingDelete(false);
    await deleteExpense(editId);
    router.back();
  }

  const itemInputStyle = {
    backgroundColor: c.card, borderWidth: 1, borderColor: c.line, borderRadius: radius.md,
    paddingHorizontal: 12, paddingVertical: 11, fontSize: 15, color: c.text,
  };

  if (mode === 'view') {
    return (
      <Screen edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 12, paddingBottom: 32 }}>
          <Header
            title="Expense"
            onClose={() => router.back()}
            right={
              <Pressable onPress={() => setMode('edit')} hitSlop={14} accessibilityLabel="Edit" style={{ marginRight: 14 }}>
                <Ionicons name="pencil-outline" size={21} color={c.sub} />
              </Pressable>
            }
          />

          <Row style={{ alignItems: 'center', gap: 10, marginTop: 10 }}>
            {cat && <IconDot icon={cat.icon} color={cat.color} size={44} />}
            <View style={{ flex: 1 }}>
              <T size={15} weight="600">{note || cat?.name || ''}</T>
              {note ? <T size={13} sub style={{ marginTop: 2 }}>{cat?.name}</T> : null}
            </View>
          </Row>
          <Money value={value} size={40} weight="700" style={{ marginTop: 18, letterSpacing: -1 }} />

          <Divider style={{ marginTop: 20, marginBottom: 14 }} />

          {viewItems.length > 0 && (
            <>
              {viewItems.map((it) => (
                <Row key={it.id} style={{ justifyContent: 'space-between', paddingVertical: 7 }}>
                  <T size={14} sub style={{ flex: 1 }} numberOfLines={1}>
                    {it.name || 'Item'}{it.quantity !== 1 ? ` ×${it.quantity}` : ''}
                  </T>
                  <Money value={it.quantity * it.amount} size={14} />
                </Row>
              ))}
              <Divider style={{ marginTop: 10, marginBottom: 14 }} />
            </>
          )}

          <Row style={{ justifyContent: 'space-between', paddingVertical: 6 }}>
            <T size={13.5} sub>Date</T>
            <T size={13.5}>{prettyDate(date)}</T>
          </Row>
          {userTag.trim().length > 0 && (
            <Row style={{ justifyContent: 'space-between', paddingVertical: 6 }}>
              <T size={13.5} sub>For user</T>
              <Row style={{ gap: 6, alignItems: 'center' }}>
                <Ionicons name="person-circle-outline" size={16} color={c.sub} />
                <T size={13.5} weight="600">{userTag}</T>
              </Row>
            </Row>
          )}
          {subCategory.trim().length > 0 && (
            <Row style={{ justifyContent: 'space-between', paddingVertical: 6 }}>
              <T size={13.5} sub>Ticket type</T>
              <T size={13.5} weight="600">{subCategory}</T>
            </Row>
          )}
          <Row style={{ justifyContent: 'space-between', paddingVertical: 6 }}>
            <T size={13.5} sub>Paid with</T>
            <T size={13.5}>{method}</T>
          </Row>
          {peopleCount.trim() && (
            <Row style={{ justifyContent: 'space-between', paddingVertical: 6 }}>
              <T size={13.5} sub>People</T>
              <T size={13.5}>{peopleCount}</T>
            </Row>
          )}
          {refunded && refundAmount.trim() && (
            <Row style={{ justifyContent: 'space-between', paddingVertical: 6 }}>
              <T size={13.5} sub style={{ color: c.danger }}>Refunded</T>
              <T size={13.5} weight="600" style={{ color: c.danger }}>
                ₹{refundAmount}
                {refundPeopleCount.trim() ? ` (${refundPeopleCount} of ${peopleCount})` : ''}
                {refundAccountId ? ` · ${bankAccounts.find((a) => a.id === refundAccountId)?.name ?? ''}` : ''}
              </T>
            </Row>
          )}
          {notes.trim().length > 0 && (
            <View style={{ marginTop: 14 }}>
              <T size={13} sub style={{ marginBottom: 4 }}>Notes</T>
              <T size={14.5} style={{ lineHeight: 20 }}>{notes}</T>
            </View>
          )}

          <Button title="Edit expense" icon="pencil-outline" kind="ghost" onPress={() => setMode('edit')} style={{ marginTop: 24 }} />
          <Button title="Delete expense" kind="danger" onPress={() => setConfirmingDelete(true)} style={{ marginTop: 10 }} />
        </ScrollView>
        <ConfirmDialog
          visible={confirmingDelete}
          title="Delete this expense?"
          message="It will be removed from your history."
          onConfirm={confirmDelete}
          onCancel={() => setConfirmingDelete(false)}
        />
      </Screen>
    );
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 12, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
          <Header
            title={editId ? 'Edit expense' : 'New expense'}
            onClose={editId ? () => setMode('view') : () => router.back()}
          />

          {!editId && (
            <Pressable
              onPress={handleScanReceipt}
              disabled={ocrScanning}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                paddingVertical: 10,
                paddingHorizontal: 16,
                borderRadius: radius.md,
                backgroundColor: c.card,
                borderWidth: 1,
                borderColor: c.line,
                marginTop: 6,
                marginBottom: 16,
                opacity: pressed || ocrScanning ? 0.7 : 1,
              })}
              accessibilityRole="button"
              accessibilityLabel="Scan receipt or bill with AI"
            >
              {ocrScanning ? (
                <ActivityIndicator size="small" color={c.accent} />
              ) : (
                <Ionicons name="scan-outline" size={18} color={c.accent} />
              )}
              <T size={13.5} weight="600" style={{ color: c.accent }}>
                {ocrScanning ? 'Scanning receipt with AI…' : 'Scan Receipt / Bill with AI'}
              </T>
            </Pressable>
          )}

          <Row style={{ alignItems: 'center', gap: 6, marginTop: 6, marginBottom: hasItems ? 2 : 22 }}>
            <T size={34} weight="600" sub>{symbol}</T>
            {hasItems ? (
              <T size={44} weight="700" tabular style={{ flex: 1, letterSpacing: -1.2 }}>
                {itemsTotal % 1 === 0 ? itemsTotal : itemsTotal.toFixed(2)}
              </T>
            ) : (
              <TextInput
                value={amount}
                onChangeText={setAmount}
                placeholder="0"
                placeholderTextColor={c.faint}
                keyboardType="decimal-pad"
                autoFocus={!editId}
                style={[{
                  flex: 1, fontSize: 44, fontWeight: '700', color: c.text,
                  padding: 0, letterSpacing: -1.2,
                }, numerals]}
              />
            )}
          </Row>

          {hasItems ? (
            <View style={{ marginBottom: 20 }}>
              <Row style={{ justifyContent: 'space-between', marginBottom: 10, alignItems: 'center' }}>
                <T size={13} sub>{items.length} item{items.length === 1 ? '' : 's'}</T>
                <T size={13} sub onPress={clearItems}>Clear</T>
              </Row>
              {items.map((it, i) => (
                <View key={i} style={{ marginBottom: 10 }}>
                  <Row style={{ gap: 8, marginBottom: 6 }}>
                    <TextInput
                      value={it.name}
                      onChangeText={(t) => updateItem(i, { name: t })}
                      placeholder={`Item ${i + 1}`}
                      placeholderTextColor={c.faint}
                      style={[itemInputStyle, { flex: 1 }]}
                    />
                    <Pressable onPress={() => removeItem(i)} hitSlop={10} accessibilityLabel={`Remove item ${i + 1}`}>
                      <Ionicons name="close-circle" size={22} color={c.faint} />
                    </Pressable>
                  </Row>
                  <Row style={{ gap: 8 }}>
                    <TextInput
                      value={it.qty}
                      onChangeText={(t) => updateItem(i, { qty: t })}
                      placeholder="1"
                      placeholderTextColor={c.faint}
                      keyboardType="decimal-pad"
                      style={[itemInputStyle, numerals, { width: 56, textAlign: 'center' }]}
                    />
                    <T size={15} sub style={{ alignSelf: 'center' }}>×</T>
                    <TextInput
                      value={it.amount}
                      onChangeText={(t) => updateItem(i, { amount: t })}
                      placeholder="price"
                      placeholderTextColor={c.faint}
                      keyboardType="decimal-pad"
                      style={[itemInputStyle, numerals, { flex: 1, textAlign: 'right' }]}
                    />
                    <T size={14} sub tabular style={{ width: 64, textAlign: 'right', alignSelf: 'center' }}>
                      {lineTotal(it) > 0 ? (lineTotal(it) % 1 === 0 ? lineTotal(it) : lineTotal(it).toFixed(2)) : ''}
                    </T>
                  </Row>
                </View>
              ))}
              <Pressable onPress={addItem} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <Ionicons name="add-circle-outline" size={16} color={c.sub} />
                <T size={13.5} sub>Add item</T>
              </Pressable>
            </View>
          ) : (
            <Pressable onPress={startItems} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 22 }}>
              <Ionicons name="add-circle-outline" size={16} color={c.sub} />
              <T size={13.5} sub>Split into items</T>
            </Pressable>
          )}

          <Field
            label="Title (optional)"
            right={
              <Pressable
                hitSlop={8}
                onPress={runAiTitleGeneration}
                disabled={aiTitleGenerating}
                accessibilityLabel="Generate title with AI"
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
              >
                {aiTitleGenerating ? (
                  <ActivityIndicator size="small" color={c.accent} />
                ) : (
                  <Ionicons name="sparkles-outline" size={13} color={c.accent} />
                )}
                <T size={13} style={{ color: c.accent, fontWeight: '600' }}>
                  {aiTitleGenerating ? 'Generating…' : 'AI Title'}
                </T>
              </Pressable>
            }
            value={note}
            onChangeText={onChangeNote}
            placeholder={hasItems ? 'e.g. Walmart run' : 'e.g. Lunch with team'}
          />

          <Row style={{ marginBottom: 9, gap: 7 }}>
            <T size={13} sub>Category</T>
            {aiGuessing && (
              <Row style={{ gap: 5 }}>
                <ActivityIndicator size="small" color={c.sub} />
                <T size={12} sub>Guessing with AI…</T>
              </Row>
            )}
          </Row>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {cats.map((k) => (
              <Chip key={k.id} label={k.name} color={k.color} active={catId === k.id} onPress={() => onPickCategory(k.id)} />
            ))}
          </View>

          {isOther && (
            <Field
              label={aiSuggestedCat && customCat ? 'AI suggested category name (edit if needed)' : 'Name the new category (optional)'}
              value={customCat}
              onChangeText={(v) => { setCustomCat(v); if (aiSuggestedCat && !v) setAiSuggestedCat(false); }}
              placeholder="e.g. Gifts"
              maxLength={30}
              containerStyle={{ marginTop: 12 }}
            />
          )}

          <T size={13} sub style={{ marginTop: 16, marginBottom: 9 }}>For user / Tag person (optional)</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' }}>
            {savedUsers.map((u) => (
              <Chip
                key={u.id}
                label={u.name}
                icon="person-outline"
                active={userTag.toLowerCase() === u.name.toLowerCase()}
                onPress={() => setUserTag(userTag.toLowerCase() === u.name.toLowerCase() ? '' : u.name)}
              />
            ))}
            {!showNewUserInput && (
              <Chip
                label="+ Add person"
                active={false}
                onPress={() => setShowNewUserInput(true)}
              />
            )}
          </View>

          {showNewUserInput && (
            <Row style={{ gap: 8, marginTop: 4, marginBottom: 8, alignItems: 'center' }}>
              <Field
                value={newUserName}
                onChangeText={setNewUserName}
                placeholder="Person name (e.g. Rahul, Mom)"
                containerStyle={{ flex: 1, marginBottom: 0 }}
                autoFocus
              />
              <Button
                title="Add"
                kind="ghost"
                disabled={!newUserName.trim()}
                onPress={async () => {
                  const trimmed = newUserName.trim();
                  if (!trimmed) return;
                  await findOrCreateTaggedUser(trimmed);
                  setUserTag(trimmed);
                  if (!savedUsers.some((u) => u.name.toLowerCase() === trimmed.toLowerCase())) {
                    setSavedUsers((prev) => [...prev, { id: trimmed, name: trimmed }].sort((a, b) => a.name.localeCompare(b.name)));
                  }
                  setNewUserName('');
                  setShowNewUserInput(false);
                }}
              />
              <Pressable
                hitSlop={10}
                onPress={() => { setShowNewUserInput(false); setNewUserName(''); }}
                accessibilityLabel="Cancel add person"
              >
                <Ionicons name="close-circle" size={22} color={c.faint} />
              </Pressable>
            </Row>
          )}

          <T size={13} sub style={{ marginTop: 16, marginBottom: 9 }}>Date</T>
          <Pressable
            onPress={() => setShowPicker((s) => !s)}
            style={{ backgroundColor: c.card, borderWidth: 1, borderColor: c.line, borderRadius: radius.md, padding: 14, marginBottom: 16 }}
          >
            <Row style={{ justifyContent: 'space-between' }}>
              <T size={15}>{prettyDate(date)}</T>
              <Ionicons name="calendar-outline" size={18} color={c.sub} />
            </Row>
          </Pressable>
          {showPicker && (
            <DateTimePicker
              value={fromStr(date)}
              mode="date"
              maximumDate={new Date()}
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              onChange={(_, d) => {
                if (Platform.OS !== 'ios') setShowPicker(false);
                if (d) setDate(toStr(d));
              }}
            />
          )}

          <Field label="Notes (optional)" value={notes} onChangeText={setNotes} placeholder="Any extra detail" />

          <T size={13} sub style={{ marginBottom: 9 }}>Paid with</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {METHODS.map((m) => (
              <Chip key={m} label={m} active={method === m} onPress={() => setMethod(m)} />
            ))}
          </View>

          {method === 'UPI' ? (
            <View style={{ marginTop: 14 }}>
              <T size={13} sub style={{ marginBottom: 9 }}>From which bank</T>
              {bankAccounts.length > 0 ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                  {bankAccounts.map((a) => (
                    <Chip
                      key={a.id}
                      label={a.institution ? `${a.name} · ${a.institution}` : a.name}
                      active={accountId === a.id}
                      onPress={() => setAccountId(accountId === a.id ? null : a.id)}
                    />
                  ))}
                </View>
              ) : (
                <Pressable onPress={() => router.push('/expense/net-worth')}>
                  <T size={13} style={{ color: c.accent }}>Add a bank account to track balance ›</T>
                </Pressable>
              )}
            </View>
          ) : null}

          {cat?.name === 'Ticket' ? (
            <View style={{ marginTop: 16 }}>
              <T size={13} sub style={{ marginBottom: 9 }}>Ticket type (optional)</T>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' }}>
                {ticketTypes.map((t) => (
                  <Chip
                    key={t.id}
                    label={t.name}
                    active={subCategory.toLowerCase() === t.name.toLowerCase()}
                    onPress={() => setSubCategory(subCategory.toLowerCase() === t.name.toLowerCase() ? '' : t.name)}
                  />
                ))}
                {!showNewTicketTypeInput && (
                  <Chip label="+ Add type" active={false} onPress={() => setShowNewTicketTypeInput(true)} />
                )}
              </View>

              {showNewTicketTypeInput && (
                <Row style={{ gap: 8, marginTop: 8, alignItems: 'center' }}>
                  <Field
                    value={newTicketTypeName}
                    onChangeText={setNewTicketTypeName}
                    placeholder="e.g. Bus, Concert"
                    containerStyle={{ flex: 1, marginBottom: 0 }}
                    autoFocus
                  />
                  <Button
                    title="Add"
                    kind="ghost"
                    disabled={!newTicketTypeName.trim()}
                    onPress={async () => {
                      const trimmed = newTicketTypeName.trim();
                      if (!trimmed) return;
                      await findOrCreateTicketType(trimmed);
                      setSubCategory(trimmed);
                      if (!ticketTypes.some((t) => t.name.toLowerCase() === trimmed.toLowerCase())) {
                        setTicketTypes((prev) => [...prev, { id: trimmed, name: trimmed }].sort((a, b) => a.name.localeCompare(b.name)));
                      }
                      setNewTicketTypeName('');
                      setShowNewTicketTypeInput(false);
                    }}
                  />
                  <Pressable
                    hitSlop={10}
                    onPress={() => { setShowNewTicketTypeInput(false); setNewTicketTypeName(''); }}
                    accessibilityLabel="Cancel add ticket type"
                  >
                    <Ionicons name="close-circle" size={22} color={c.faint} />
                  </Pressable>
                </Row>
              )}

              <Field
                label="Number of people (optional)"
                value={peopleCount}
                onChangeText={setPeopleCount}
                placeholder="e.g. 5"
                keyboardType="number-pad"
                containerStyle={{ marginTop: 14 }}
              />

              <T size={13} sub style={{ marginTop: 12, marginBottom: 9 }}>Refunded?</T>
              <Row style={{ gap: 10 }}>
                <Chip label="No" active={!refunded} onPress={() => setRefunded(false)} />
                <Chip label="Yes" active={refunded} onPress={() => setRefunded(true)} />
              </Row>

              {refunded ? (
                <>
                  {parseAmt(peopleCount) > 1 ? (
                    <Field
                      label={`People cancelled (of ${peopleCount})`}
                      value={refundPeopleCount}
                      onChangeText={(text) => {
                        setRefundPeopleCount(text);
                        const total = parseAmt(peopleCount);
                        const cancelledN = parseAmt(text);
                        // A per-person share of the total, for however many of
                        // them were cancelled — still editable below in case
                        // a fee wasn't refunded along with it.
                        if (total > 0 && cancelledN > 0) {
                          setRefundAmount(String(round2((round2(value) / total) * Math.min(cancelledN, total))));
                        }
                      }}
                      placeholder="e.g. 2"
                      keyboardType="number-pad"
                      containerStyle={{ marginTop: 12 }}
                    />
                  ) : null}

                  <Field
                    label="Refunded amount"
                    value={refundAmount}
                    onChangeText={setRefundAmount}
                    placeholder={String(round2(value) || 0)}
                    keyboardType="decimal-pad"
                    containerStyle={{ marginTop: 12 }}
                  />

                  <T size={13} sub style={{ marginTop: 12, marginBottom: 9 }}>Into which bank (UPI)</T>
                  {bankAccounts.length > 0 ? (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                      {bankAccounts.map((a) => (
                        <Chip
                          key={a.id}
                          label={a.institution ? `${a.name} · ${a.institution}` : a.name}
                          active={refundAccountId === a.id}
                          onPress={() => setRefundAccountId(refundAccountId === a.id ? null : a.id)}
                        />
                      ))}
                    </View>
                  ) : (
                    <Pressable onPress={() => router.push('/expense/net-worth')}>
                      <T size={13} style={{ color: c.accent }}>Add a bank account to track balance ›</T>
                    </Pressable>
                  )}
                </>
              ) : null}
            </View>
          ) : null}

          <Button
            title={saving ? 'Saving…' : editId ? 'Save changes' : 'Add expense'}
            onPress={onSave}
            disabled={!valid || saving}
            style={{ marginTop: 22 }}
          />
          {editId ? <Button title="Delete expense" kind="danger" onPress={() => setConfirmingDelete(true)} style={{ marginTop: 10 }} /> : null}
        </ScrollView>
      </KeyboardAvoidingView>
      <ConfirmDialog
        visible={confirmingDelete}
        title="Delete this expense?"
        message="It will be removed from your history."
        onConfirm={confirmDelete}
        onCancel={() => setConfirmingDelete(false)}
      />
    </Screen>
  );
}
