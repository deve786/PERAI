import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
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
  listCategories, listExpenseItems, listTaggedUsers, listTicketTypes, saveExpense, saveExpenseItems,
  setExpenseCancelledPending, setExpenseRefund, setExpenseReimbursement,
  type Category, type ExpenseItem as ExpenseItemRow, type TaggedUser, type TicketType,
} from '@/expense/db';
import { listAccounts, type AccountItem } from '@/expense/accountsDb';
import { PlacePicker } from '@/expense/PlacePicker';
import { fromStr, monthName, prettyDate, toStr, todayStr } from '@/expense/dates';
import { noteBudgetCrossing } from '@/expense/budgetAlerts';
import { fmtMoney } from '@/expense/stats';
import { FONTS, numerals, radius, useTheme } from '@/expense/theme';
import {
  ActionBar, Button, Card, Chip, ConfirmDialog, Field, IconDot, Label, ListCard, ListRow, Money, Row, Screen, Section, Segmented, T,
} from '@/expense/ui';
import { showDialog } from '@/dialogStore';
import { KeyboardLift } from '@/components/KeyboardLift';
import { isSizeUnit, itemSizeText, pricePerUnitText, SIZE_UNITS } from '@/expense/itemSize';

/** One bought thing. `amount` is the price of ONE pack; `weight` + `unit` is the size of one pack ("1" "kg"). */
type DraftItem = { name: string; qty: string; amount: string; weight: string; unit: string; sizeOpen?: boolean };
type Mode = 'view' | 'edit';

const parseAmt = (s: string) => parseFloat(s.replace(/,/g, ''));
const round2 = (n: number) => Math.round(n * 100) / 100;
const lineTotal = (it: DraftItem) => (parseAmt(it.qty) || 1) * (parseAmt(it.amount) || 0);

const METHOD_OPTIONS = METHODS.map((m): { key: string; label: string } => ({ key: m, label: m }));
const METHOD_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  Cash: 'cash-outline', UPI: 'phone-portrait-outline', Card: 'card-outline', Bank: 'business-outline',
};
const YES_NO = [{ key: 'no', label: 'No' }, { key: 'yes', label: 'Yes' }] as const;
const SAME_DIFFERENT = [{ key: 'same', label: 'Same amount' }, { key: 'different', label: 'Different amount' }] as const;

/** "Today, 22 Oct" / "Yesterday, 21 Oct" / "20 Oct". */
function longDate(s: string) {
  const p = prettyDate(s);
  if (p !== 'Today' && p !== 'Yesterday') return p;
  const d = fromStr(s);
  return `${p}, ${d.getDate()} ${monthName(d.getMonth())}`;
}

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
  const [reimbursed, setReimbursed] = useState(false);
  const [reimburseSame, setReimburseSame] = useState(true);
  const [reimburseAmount, setReimburseAmount] = useState('');
  const [reimburseAccountId, setReimburseAccountId] = useState<string | null>(null);
  const [userTag, setUserTag] = useState('');
  const [place, setPlace] = useState('');
  const [placeDraft, setPlaceDraft] = useState('');
  const [savedUsers, setSavedUsers] = useState<TaggedUser[]>([]);
  const [showNewUserInput, setShowNewUserInput] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const [customCat, setCustomCat] = useState('');
  const [aiSuggestedCat, setAiSuggestedCat] = useState(false); // true when customCat was filled by AI
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // Optional fields fold away; opened by default when editing an expense that already uses them.
  const [moreOpen, setMoreOpen] = useState(false);
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
          if (e.place) setPlace(e.place);
          if (e.sub_category) setSubCategory(e.sub_category);
          setReimbursed(e.reimbursed === 1);
          setReimburseAmount(e.reimburse_amount != null ? String(e.reimburse_amount) : '');
          setReimburseAccountId(e.reimburse_account_id ?? null);
          setReimburseSame(e.reimburse_amount != null ? e.reimburse_amount === e.amount : true);
          if (e.place || e.user_tag || e.notes || e.sub_category || e.people_count != null || e.cancelled === 1 || e.reimbursed === 1) {
            setMoreOpen(true);
          }
        }
        const existing = await listExpenseItems(editId);
        setViewItems(existing);
        if (existing.length) {
          setItems(existing.map((it) => ({
            name: it.name, qty: String(it.quantity), amount: String(it.amount),
            weight: it.weight ? String(it.weight) : '', unit: isSizeUnit(it.unit) ? it.unit : 'kg',
          })));
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
    setItems([{ name: '', qty: '1', amount: seed, weight: '', unit: 'kg' }]);
  }
  function clearItems() {
    if (itemsTotal > 0) setAmount(String(itemsTotal));
    setItems([]);
  }
  function addItem() {
    setItems((prev) => [...prev, { name: '', qty: '1', amount: '', weight: '', unit: 'kg' }]);
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
      place: (place || placeDraft).trim(),
      // Only a UPI payment is tied to the bank it drew from — switching away
      // from UPI drops the link rather than leaving a stale one behind.
      account_id: method === 'UPI' ? accountId : null,
      people_count: isTicket && parseAmt(peopleCount) > 0 ? Math.round(parseAmt(peopleCount)) : null,
      sub_category: finalSubCategory,
    });
    const cleanItems = hasItems
      ? items
          .map((it) => ({
            name: it.name.trim(), quantity: parseAmt(it.qty) || 1, amount: round2(parseAmt(it.amount) || 0),
            weight: parseAmt(it.weight) > 0 ? parseAmt(it.weight) : null, unit: it.unit,
          }))
          .filter((it) => it.quantity * it.amount > 0)
      : [];
    await saveExpenseItems(newId, cleanItems);
    // Only a Ticket carries a refund; the field is hidden for anything else,
    // so there's nothing to set (or clear) on another category.
    if (isTicket) {
      const parsedRefund = round2(parseAmt(refundAmount) || 0);
      if (refunded && parsedRefund > 0) {
        await setExpenseRefund(newId, {
          amount: parsedRefund,
          accountId: refundAccountId,
          peopleCount: parseAmt(refundPeopleCount) > 0 ? Math.round(parseAmt(refundPeopleCount)) : null,
        });
      } else if (refunded) {
        // Cancelled, but the refund hasn't come yet: remembered, and the app
        // reminds every 2 days until the amount is entered.
        await setExpenseCancelledPending(newId);
      } else {
        await setExpenseRefund(newId, null);
      }
    }
    // Whoever this was tagged "for user" can pay back what it cost — any
    // category, not just a Ticket, so it's keyed off the tag, not isTicket.
    if (finalUserTag) {
      const parsedReimburse = round2((reimburseSame ? value : parseAmt(reimburseAmount)) || 0);
      await setExpenseReimbursement(
        newId,
        reimbursed && parsedReimburse > 0 ? { amount: parsedReimburse, accountId: reimburseAccountId } : null
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
            weight: '',
            unit: 'kg',
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
    fontFamily: FONTS.sans, backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: radius.sm,
    paddingHorizontal: 12, minHeight: 44, paddingVertical: 10, fontSize: 15, color: c.text,
  };
  const bankName = (bankId: string | null) => (bankId ? bankAccounts.find((a) => a.id === bankId)?.name ?? '' : '');
  const otherCat = cats.find((k) => k.name === 'Other');
  const isTicketCat = cat?.name === 'Ticket';

  /** Bank account chips (or a link to add one), for "From", "Into" and refunds. */
  const bankChips = (selected: string | null, onSelect: (bankId: string | null) => void, lead?: string) =>
    bankAccounts.length > 0 ? (
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' }}>
        {lead ? <T size={14} sub style={{ marginRight: 10, marginBottom: 8 }}>{lead}</T> : null}
        {bankAccounts.map((a) => (
          <Chip
            key={a.id}
            label={a.institution ? `${a.name} · ${a.institution}` : a.name}
            active={selected === a.id}
            onPress={() => onSelect(selected === a.id ? null : a.id)}
          />
        ))}
      </View>
    ) : (
      <Pressable onPress={() => router.push('/expense/net-worth')} hitSlop={8} accessibilityRole="button" style={{ minHeight: 36, justifyContent: 'center' }}>
        <T size={14} weight="600" style={{ color: c.accent }}>Add a bank account to track balance</T>
      </Pressable>
    );

  if (mode === 'view') {
    const details: Detail[] = [
      { icon: 'calendar-outline', label: 'Date', value: longDate(date) },
      { icon: METHOD_ICONS[method] ?? 'wallet-outline', label: 'Paid with', value: method === 'UPI' && bankName(accountId) ? `${method} · ${bankName(accountId)}` : method },
    ];
    if (place.trim()) details.push({ icon: 'location-outline', label: 'Place', value: place });
    if (userTag.trim()) details.push({ icon: 'person-outline', label: 'For', value: userTag });
    if (subCategory.trim()) details.push({ icon: 'ticket-outline', label: 'Ticket type', value: subCategory });
    if (peopleCount.trim()) details.push({ icon: 'people-outline', label: 'People', value: peopleCount });
    if (refunded && !refundAmount.trim()) {
      details.push({
        icon: 'time-outline', label: 'Refund', tone: c.warn,
        value: 'Not entered yet — reminding every 2 days',
      });
    }
    if (refunded && refundAmount.trim()) {
      details.push({
        icon: 'arrow-undo-outline', label: 'Refunded', tone: c.danger,
        value: `${fmtMoney(parseAmt(refundAmount) || 0, symbol)}${refundPeopleCount.trim() ? ` (${refundPeopleCount} of ${peopleCount})` : ''}${refundAccountId ? ` · ${bankName(refundAccountId)}` : ''}`,
      });
    }
    if (reimbursed && reimburseAmount.trim()) {
      details.push({
        icon: 'checkmark-circle-outline', label: `Paid back by ${userTag || 'them'}`, tone: c.good,
        value: `${fmtMoney(parseAmt(reimburseAmount) || 0, symbol)}${reimburseAccountId ? ` · ${bankName(reimburseAccountId)}` : ''}`,
      });
    }
    if (notes.trim()) details.push({ icon: 'document-text-outline', label: 'Notes', value: notes, block: true });

    return (
      <Screen edges={['top', 'bottom']}>
        <ActionBar
          title="Expense"
          onClose={() => router.back()}
          actions={[{ label: 'Edit', onPress: () => setMode('edit') }]}
        />
        <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 20, paddingTop: 16, paddingBottom: 24 }}>
          <Card style={{ alignItems: 'center', paddingVertical: 24, gap: 8 }}>
            {cat ? <IconDot icon={cat.icon} color={cat.color} size={56} /> : null}
            <T size={18} weight="600" style={{ textAlign: 'center' }}>{note || cat?.name || ''}</T>
            {note && cat ? (
              <View style={{ backgroundColor: c.well, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 4 }}>
                <T size={13} sub>{cat.name}</T>
              </View>
            ) : null}
            <Money value={value || 0} size={44} weight="600" style={{ marginTop: 6, letterSpacing: -1 }} />
          </Card>

          <ListCard style={{ marginTop: 16 }}>
            {details.map((d, i) => <DetailRow key={d.label} {...d} last={i === details.length - 1} />)}
          </ListCard>

          {viewItems.length > 0 && (
            <>
              <Section title="Items" />
              <ListCard>
                {viewItems.map((it, i) => (
                  <Row
                    key={it.id}
                    style={{
                      minHeight: 48, gap: 12, justifyContent: 'space-between',
                      borderBottomWidth: i === viewItems.length - 1 ? 0 : StyleSheet.hairlineWidth, borderBottomColor: c.line,
                    }}
                  >
                    <View style={{ flex: 1, paddingVertical: 6 }}>
                      <T size={15} numberOfLines={1}>
                        {it.name || 'Item'}{it.quantity !== 1 && !it.weight ? <T size={15} sub tabular>{` ×${it.quantity}`}</T> : null}
                      </T>
                      {it.weight ? (
                        <T size={13} sub>
                          {itemSizeText(it.quantity, it.weight, it.unit)}
                          {pricePerUnitText(it.amount, it.weight, it.unit, symbol) ? ` · ${pricePerUnitText(it.amount, it.weight, it.unit, symbol)}` : ''}
                        </T>
                      ) : null}
                    </View>
                    <Money value={it.quantity * it.amount} size={15} weight="500" />
                  </Row>
                ))}
              </ListCard>
            </>
          )}

          <View style={{ flex: 1, minHeight: 24 }} />
          <Button title="Delete expense" icon="trash-outline" kind="danger" onPress={() => setConfirmingDelete(true)} />
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

  const moreHint = isTicketCat
    ? 'Ticket type, people, refund, place, person, notes'
    : 'Place, person, notes';

  return (
    <Screen edges={['top', 'bottom']}>
      <ActionBar
        title={editId ? 'Edit expense' : 'New expense'}
        onCancel={editId ? () => setMode('view') : () => router.back()}
        actions={[{ label: saving ? 'Saving…' : 'Save', onPress: onSave, primary: true, disabled: !valid || saving }]}
      />
      <KeyboardLift style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 16, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
          <Card style={{ alignItems: 'center', paddingVertical: 20 }}>
            <T size={14} sub>Amount</T>
            <Row style={{ justifyContent: 'center', gap: 10, marginTop: 4, maxWidth: '100%' }}>
              <T size={28} sub tabular>{symbol}</T>
              {hasItems ? (
                <T size={48} weight="600" tabular numberOfLines={1} style={{ letterSpacing: -1.2 }}>
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
                  accessibilityLabel="Amount"
                  style={[{
                    fontFamily: FONTS.monoMedium, fontSize: 48, color: c.text,
                    padding: 0, minWidth: 64, maxWidth: 260, textAlign: 'center', letterSpacing: -1.2,
                  }, numerals]}
                />
              )}
            </Row>
            {hasItems ? <T size={13} sub style={{ marginTop: 2 }}>Total of {items.length} item{items.length === 1 ? '' : 's'}</T> : null}
            {!editId && (
              <Pressable
                onPress={handleScanReceipt}
                disabled={ocrScanning}
                accessibilityRole="button"
                accessibilityLabel="Scan receipt or bill with AI"
                style={({ pressed }) => ({
                  flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14,
                  minHeight: 40, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: c.accentSoft,
                  opacity: pressed || ocrScanning ? 0.7 : 1,
                })}
              >
                {ocrScanning ? (
                  <ActivityIndicator size="small" color={c.accent} />
                ) : (
                  <Ionicons name="camera-outline" size={18} color={c.accent} />
                )}
                <T size={14} weight="600" style={{ color: c.accent }}>
                  {ocrScanning ? 'Reading the bill with AI…' : 'Scan a bill instead'}
                </T>
              </Pressable>
            )}
          </Card>

          {!hasItems && (
            <Pressable
              onPress={startItems}
              accessibilityRole="button"
              accessibilityLabel="Split into items"
              style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12, minHeight: 58,
                paddingHorizontal: 14, borderRadius: radius.lg, borderWidth: 1, borderColor: c.line, backgroundColor: c.card,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Ionicons name="list-outline" size={22} color={c.accent} />
              <View style={{ flex: 1 }}>
                <T size={15} weight="600">Split into items</T>
                <T size={13} sub>Add what you bought: quantity, price and weight</T>
              </View>
              <Ionicons name="chevron-forward" size={18} color={c.faint} />
            </Pressable>
          )}

          {hasItems && (
            <Card style={{ marginTop: 12 }}>
              <Row style={{ justifyContent: 'space-between', marginBottom: 10 }}>
                <T size={14} weight="600">Items</T>
                <Pressable onPress={clearItems} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear items">
                  <T size={14} weight="600" style={{ color: c.accent }}>Clear</T>
                </Pressable>
              </Row>
              {items.map((it, i) => (
                <View key={i} style={{ marginBottom: 12 }}>
                  <Row style={{ gap: 8, marginBottom: 6 }}>
                    <TextInput
                      value={it.name}
                      onChangeText={(t) => updateItem(i, { name: t })}
                      placeholder={`Item ${i + 1}`}
                      placeholderTextColor={c.faint}
                      style={[itemInputStyle, { flex: 1 }]}
                    />
                    <Pressable onPress={() => removeItem(i)} hitSlop={8} accessibilityLabel={`Remove item ${i + 1}`} style={{ width: 36, height: 44, alignItems: 'center', justifyContent: 'center' }}>
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
                      accessibilityLabel={`Quantity of item ${i + 1}`}
                      style={[itemInputStyle, numerals, { fontFamily: FONTS.mono, width: 56, textAlign: 'center' }]}
                    />
                    <T size={15} sub>×</T>
                    <TextInput
                      value={it.amount}
                      onChangeText={(t) => updateItem(i, { amount: t })}
                      placeholder="Price"
                      placeholderTextColor={c.faint}
                      keyboardType="decimal-pad"
                      accessibilityLabel={`Price of item ${i + 1}`}
                      style={[itemInputStyle, numerals, { fontFamily: FONTS.mono, flex: 1, textAlign: 'right' }]}
                    />
                    <T size={14} sub tabular style={{ width: 72, textAlign: 'right' }}>
                      {lineTotal(it) > 0 ? (lineTotal(it) % 1 === 0 ? lineTotal(it) : lineTotal(it).toFixed(2)) : ''}
                    </T>
                  </Row>
                  {it.sizeOpen || it.weight.trim() ? (
                    <View style={{ marginTop: 10 }}>
                      <Row style={{ gap: 10 }}>
                        <T size={14} sub>Size of one</T>
                        <TextInput
                          value={it.weight}
                          onChangeText={(t) => updateItem(i, { weight: t })}
                          placeholder="1"
                          placeholderTextColor={c.faint}
                          keyboardType="decimal-pad"
                          accessibilityLabel={`Weight or size of one of item ${i + 1}`}
                          style={[itemInputStyle, numerals, { fontFamily: FONTS.mono, width: 84, textAlign: 'center' }]}
                        />
                      </Row>
                      <Row style={{ marginTop: 10, flexWrap: 'wrap' }}>
                        {SIZE_UNITS.map((u) => (
                          <Chip key={u} label={u} active={it.unit === u} onPress={() => updateItem(i, { unit: u })} />
                        ))}
                      </Row>
                      {itemSizeText(parseAmt(it.qty) || 1, parseAmt(it.weight), it.unit) ? (
                        <T size={13} sub style={{ marginTop: 2 }}>
                          {itemSizeText(parseAmt(it.qty) || 1, parseAmt(it.weight), it.unit)}
                          {pricePerUnitText(parseAmt(it.amount) || 0, parseAmt(it.weight), it.unit, symbol)
                            ? ` · ${pricePerUnitText(parseAmt(it.amount) || 0, parseAmt(it.weight), it.unit, symbol)}`
                            : ''}
                        </T>
                      ) : null}
                    </View>
                  ) : (
                    <Pressable
                      onPress={() => updateItem(i, { sizeOpen: true })}
                      hitSlop={6}
                      accessibilityRole="button"
                      accessibilityLabel={`Add weight or size to item ${i + 1}`}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 32, marginTop: 4 }}
                    >
                      <Ionicons name="scale-outline" size={15} color={c.accent} />
                      <T size={13} weight="600" style={{ color: c.accent }}>Add weight or size (1 kg, 500 g…)</T>
                    </Pressable>
                  )}
                </View>
              ))}
              <Pressable onPress={addItem} hitSlop={8} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36 }}>
                <Ionicons name="add" size={18} color={c.accent} />
                <T size={14} weight="600" style={{ color: c.accent }}>Add item</T>
              </Pressable>
            </Card>
          )}

          <Label style={{ marginTop: 20 }}>Title</Label>
          <Row style={{ backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: radius.sm, minHeight: 50, paddingLeft: 14, paddingRight: 6, gap: 8 }}>
            <TextInput
              value={note}
              onChangeText={onChangeNote}
              placeholder={hasItems ? 'e.g. Walmart run' : 'e.g. Lunch with team'}
              placeholderTextColor={c.faint}
              accessibilityLabel="Title"
              style={{ flex: 1, fontFamily: FONTS.sans, fontSize: 16, color: c.text, paddingVertical: 12 }}
            />
            <Pressable
              hitSlop={6}
              onPress={runAiTitleGeneration}
              disabled={aiTitleGenerating}
              accessibilityRole="button"
              accessibilityLabel="Generate title with AI"
              style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 38, paddingHorizontal: 12,
                borderRadius: radius.sm - 2, backgroundColor: c.accentSoft, opacity: pressed ? 0.7 : 1,
              })}
            >
              {aiTitleGenerating ? (
                <ActivityIndicator size="small" color={c.accent} />
              ) : (
                <Ionicons name="sparkles-outline" size={15} color={c.accent} />
              )}
              <T size={14} weight="600" style={{ color: c.accent }}>{aiTitleGenerating ? 'Writing…' : 'AI'}</T>
            </Pressable>
          </Row>

          <Row style={{ marginTop: 20, marginBottom: 8, gap: 8 }}>
            <T size={14} weight="600">Category</T>
            {aiGuessing && (
              <Row style={{ gap: 5 }}>
                <ActivityIndicator size="small" color={c.sub} />
                <T size={13} sub>Guessing with AI…</T>
              </Row>
            )}
          </Row>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {cats.map((k) => (
              <Chip key={k.id} label={k.name} color={k.color} active={catId === k.id} onPress={() => onPickCategory(k.id)} />
            ))}
            {otherCat && !isOther ? (
              <Pressable
                onPress={() => onPickCategory(otherCat.id)}
                accessibilityRole="button"
                accessibilityLabel="New category"
                style={({ pressed }) => ({
                  minHeight: 36, paddingHorizontal: 14, borderRadius: radius.pill, marginBottom: 8,
                  borderWidth: 1, borderStyle: 'dashed', borderColor: c.border,
                  justifyContent: 'center', opacity: pressed ? 0.7 : 1,
                })}
              >
                <T size={14} weight="600" style={{ color: c.accent }}>+ New</T>
              </Pressable>
            ) : null}
          </View>

          {isOther && (
            <Field
              label={aiSuggestedCat && customCat ? 'AI suggested a category name (edit if needed)' : 'Name the new category (optional)'}
              value={customCat}
              onChangeText={(v) => { setCustomCat(v); if (aiSuggestedCat && !v) setAiSuggestedCat(false); }}
              placeholder="e.g. Gifts"
              maxLength={30}
              containerStyle={{ marginTop: 8, marginBottom: 0 }}
            />
          )}

          <Label style={{ marginTop: 20 }}>Paid with</Label>
          <Segmented options={METHOD_OPTIONS} value={method} onChange={setMethod} />
          {method === 'UPI' ? (
            <View style={{ marginTop: 12 }}>
              {bankChips(accountId, setAccountId, 'From')}
            </View>
          ) : null}

          <ListCard style={{ marginTop: method === 'UPI' ? 8 : 16 }}>
            <ListRow icon="calendar-outline" iconColor={c.text} label={longDate(date)} onPress={() => setShowPicker((s) => !s)} />
            <ListRow
              icon={moreOpen ? 'remove' : 'add'}
              iconColor={c.text}
              label="More details"
              sub={moreHint}
              onPress={() => setMoreOpen((o) => !o)}
              chevron={false}
              right={<Ionicons name={moreOpen ? 'chevron-up' : 'chevron-down'} size={18} color={c.faint} />}
              last
            />
          </ListCard>
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

          {moreOpen && (
            <View>
              {isTicketCat ? (
                <View>
                  <Label style={{ marginTop: 20 }}>Ticket type</Label>
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
                      <Chip label="Add type" icon="add" active={false} onPress={() => setShowNewTicketTypeInput(true)} />
                    )}
                  </View>

                  {showNewTicketTypeInput && (
                    <Row style={{ gap: 8, marginTop: 4, alignItems: 'center' }}>
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
                      <CloseButton label="Cancel add ticket type" onPress={() => { setShowNewTicketTypeInput(false); setNewTicketTypeName(''); }} />
                    </Row>
                  )}

                  <Field
                    label="Number of people"
                    value={peopleCount}
                    onChangeText={setPeopleCount}
                    placeholder="e.g. 5"
                    keyboardType="number-pad"
                    containerStyle={{ marginTop: 16, marginBottom: 0 }}
                  />

                  <Label style={{ marginTop: 20 }}>Cancelled?</Label>
                  <Segmented options={YES_NO} value={refunded ? 'yes' : 'no'} onChange={(k) => setRefunded(k === 'yes')} />

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
                          containerStyle={{ marginTop: 14, marginBottom: 0 }}
                        />
                      ) : null}

                      <Field
                        label="Refunded amount"
                        value={refundAmount}
                        onChangeText={setRefundAmount}
                        placeholder={String(round2(value) || 0)}
                        keyboardType="decimal-pad"
                        containerStyle={{ marginTop: 14, marginBottom: 0 }}
                      />
                      {!refundAmount.trim() ? (
                        <T size={13} sub style={{ marginTop: 6 }}>
                          {"Refund not come yet? Leave this empty and we'll remind you every 2 days to enter it."}
                        </T>
                      ) : null}

                      <Label style={{ marginTop: 14 }}>Into which bank (UPI)</Label>
                      {bankChips(refundAccountId, setRefundAccountId)}
                    </>
                  ) : null}
                </View>
              ) : null}

              <PlacePicker value={place} onChange={setPlace} onDraft={setPlaceDraft} />

              <Label style={{ marginTop: 20 }}>Person</Label>
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
                  <Chip label="Add person" icon="add" active={false} onPress={() => setShowNewUserInput(true)} />
                )}
              </View>

              {showNewUserInput && (
                <Row style={{ gap: 8, marginTop: 4, alignItems: 'center' }}>
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
                  <CloseButton label="Cancel add person" onPress={() => { setShowNewUserInput(false); setNewUserName(''); }} />
                </Row>
              )}

              {userTag.trim().length > 0 && (
                <View>
                  <Label style={{ marginTop: 20 }}>Did {userTag.trim()} pay you back?</Label>
                  <Segmented options={YES_NO} value={reimbursed ? 'yes' : 'no'} onChange={(k) => setReimbursed(k === 'yes')} />

                  {reimbursed ? (
                    <>
                      <Segmented
                        options={SAME_DIFFERENT}
                        value={reimburseSame ? 'same' : 'different'}
                        onChange={(k) => setReimburseSame(k === 'same')}
                        style={{ marginTop: 10 }}
                      />

                      {!reimburseSame && (
                        <Field
                          label="Amount they sent"
                          value={reimburseAmount}
                          onChangeText={setReimburseAmount}
                          placeholder={String(round2(value) || 0)}
                          keyboardType="decimal-pad"
                          containerStyle={{ marginTop: 14, marginBottom: 0 }}
                        />
                      )}

                      <Label style={{ marginTop: 14 }}>Into which bank (UPI)</Label>
                      {bankChips(reimburseAccountId, setReimburseAccountId)}
                    </>
                  ) : null}
                </View>
              )}

              <Field
                label="Notes"
                value={notes}
                onChangeText={setNotes}
                placeholder="Any extra detail"
                multiline
                containerStyle={{ marginTop: 20, marginBottom: 0 }}
              />

            </View>
          )}

          {editId ? (
            <Button title="Delete expense" icon="trash-outline" kind="danger" onPress={() => setConfirmingDelete(true)} style={{ marginTop: 28 }} />
          ) : null}
        </ScrollView>
      </KeyboardLift>
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

type Detail = { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; tone?: string; block?: boolean };

/** A row in the details card: icon, label, value on the right (or below, for notes). */
function DetailRow({ icon, label, value, tone, block, last }: Detail & { last?: boolean }) {
  const { c } = useTheme();
  return (
    <View style={{
      flexDirection: 'row', alignItems: block ? 'flex-start' : 'center', gap: 12, minHeight: 52, paddingVertical: 12,
      borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth, borderBottomColor: c.line,
    }}>
      <Ionicons name={icon} size={20} color={tone ?? c.sub} />
      {block ? (
        <View style={{ flex: 1 }}>
          <T size={15} sub>{label}</T>
          <T size={15} style={{ marginTop: 4, lineHeight: 21 }}>{value}</T>
        </View>
      ) : (
        <>
          <T size={15} sub style={tone ? { color: tone } : undefined}>{label}</T>
          <T size={15} weight="500" style={{ flex: 1, textAlign: 'right', color: tone ?? c.text }}>{value}</T>
        </>
      )}
    </View>
  );
}

/** Round "×" that closes an inline add row. */
function CloseButton({ label, onPress }: { label: string; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable
      hitSlop={6}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 20, backgroundColor: c.well, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}
    >
      <Ionicons name="close" size={20} color={c.sub} />
    </Pressable>
  );
}
