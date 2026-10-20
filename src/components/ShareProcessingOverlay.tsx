import { ActivityIndicator, Modal, StyleSheet, Text, View } from 'react-native';
import { useShareProcessing } from '../shareProcessingStore';
import { useTheme } from '../ThemeContext';
import { SPACE, type Colors } from '../theme';

/**
 * A small "working on it" card while a shared payment is being read —
 * mounted once at the root, next to DialogHost, so the moment GPay hands a
 * share to the app there's something on screen besides whatever page it
 * happened to open to.
 */
export function ShareProcessingOverlay() {
  const { colors, type } = useTheme();
  const styles = makeStyles(colors);
  const { active, label } = useShareProcessing();

  if (!active) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => {}} statusBarTranslucent>
      <View style={styles.scrim}>
        <View style={styles.card}>
          <ActivityIndicator color={colors.moss} />
          <Text style={[type.body, styles.label]}>{label || 'Working on it…'}</Text>
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    scrim: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.35)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: SPACE.page,
    },
    card: {
      backgroundColor: colors.paper,
      borderLeftWidth: 2,
      borderLeftColor: colors.moss,
      paddingVertical: 20,
      paddingHorizontal: 18,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      maxWidth: 420,
    },
    label: { color: colors.ink, flexShrink: 1 },
  });
}
