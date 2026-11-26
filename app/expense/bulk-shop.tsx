import React, { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { countShoplessMatching, setShopWhereTextMatches } from '@/expense/db';
import { ShopPicker } from '@/expense/ShopPicker';
import { Button, Field, Label, Screen, T, TopBar } from '@/expense/ui';

/**
 * Fill in shop names on old expenses in one go: every expense with no shop
 * whose note contains the text (e.g. a GPay payee name) gets that shop.
 */
export default function BulkShop() {
  const router = useRouter();
  const [text, setText] = useState('');
  const [shop, setShop] = useState('');
  const [count, setCount] = useState(0);
  const [result, setResult] = useState('');

  useEffect(() => {
    countShoplessMatching(text).then(setCount).catch(() => setCount(0));
  }, [text, result]);

  async function apply() {
    const n = await setShopWhereTextMatches(text, shop);
    setResult(`${n} expense${n === 1 ? '' : 's'} updated with shop "${shop.trim()}".`);
    setText('');
  }

  return (
    <Screen>
      <TopBar title="Set shop by note" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
        <T size={14} sub>
          Every expense with no shop whose note contains the text below gets the shop name. Expenses that already have a shop are left alone.
        </T>
        <Label style={{ marginTop: 20 }}>Note contains</Label>
        <Field value={text} onChangeText={(v) => { setText(v); setResult(''); }} placeholder="e.g. YAASEEN RUVAGE" containerStyle={{ marginBottom: 0 }} />
        <ShopPicker value={shop} onChange={setShop} />
        <View style={{ marginTop: 20 }}>
          <T size={14} sub>{text.trim() ? `${count} expense${count === 1 ? '' : 's'} match` : 'Type the note text to see matches'}</T>
          <Button title={`Apply to ${count}`} disabled={!count || !shop.trim()} onPress={apply} style={{ marginTop: 12 }} />
          {result ? <T size={14} style={{ marginTop: 12 }}>{result}</T> : null}
        </View>
      </ScrollView>
    </Screen>
  );
}
