import React, { useEffect, useState, useCallback } from 'react';
import { StyleSheet, View, Text, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getIslandTransitBriefing, type IslandTransitItem } from '@/sources/islandBriefing';
import { FONTS, RADIUS } from '@/theme';

interface MorningIslandBriefingProps {
  onSelectVessel?: (vesselName: string) => void;
  onRefreshLive?: () => void;
}

export function MorningIslandBriefing({ onSelectVessel, onRefreshLive }: MorningIslandBriefingProps) {
  const [items, setItems] = useState<IslandTransitItem[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchBriefing = useCallback(async () => {
    try {
      const data = await getIslandTransitBriefing();
      setItems(data);
    } catch (e) {
      console.warn('Briefing error:', e);
    }
  }, []);

  useEffect(() => {
    void fetchBriefing();
  }, [fetchBriefing]);

  async function handleRefresh() {
    setLoading(true);
    if (onRefreshLive) onRefreshLive();
    await fetchBriefing();
    setLoading(false);
  }

  return (
    <View style={styles.cardContainer}>
      <View style={styles.cardHeader}>
        <View style={styles.headerLeft}>
          <View style={styles.iconBox}>
            <Ionicons name="list" size={16} color="#10b981" />
          </View>
          <View>
            <Text style={styles.headerTitle}>Morning Island Briefing</Text>
            <Text style={styles.headerSub}>Real-time ferry & ship departures</Text>
          </View>
        </View>

        <Pressable onPress={() => void handleRefresh()} style={styles.syncBadge} hitSlop={8}>
          {loading ? (
            <ActivityIndicator size="small" color="#10b981" />
          ) : (
            <>
              <Text style={styles.syncText}>Live sync</Text>
              <Ionicons name="refresh" size={13} color="#10b981" />
            </>
          )}
        </Pressable>
      </View>

      <View style={styles.vesselList}>
        {items.map((item) => (
          <Pressable
            key={item.id}
            onPress={() => onSelectVessel?.(item.vessel)}
            style={({ pressed }) => [styles.vesselItem, pressed && styles.vesselItemPressed]}
          >
            <View style={styles.vesselAccentBar} />
            <View style={styles.vesselContent}>
              <View style={styles.vesselRowTop}>
                <Text style={styles.vesselName}>{item.vessel}</Text>
                <View style={[styles.statusPill, { backgroundColor: `${item.statusColor}22` }]}>
                  <Text style={[styles.statusPillText, { color: item.statusColor }]}>{item.status}</Text>
                </View>
              </View>
              <Text style={styles.vesselRoute} numberOfLines={2}>
                {item.route}
              </Text>
            </View>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cardContainer: {
    backgroundColor: '#161d19',
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.22)',
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  iconBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: 'rgba(16, 185, 129, 0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: FONTS.sansSemi,
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: -0.2,
  },
  headerSub: {
    fontFamily: FONTS.sans,
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 1,
  },
  syncBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 12,
  },
  syncText: {
    fontFamily: FONTS.sansSemi,
    fontSize: 12,
    fontWeight: '600',
    color: '#10b981',
  },
  vesselList: {
    gap: 10,
  },
  vesselItem: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 12,
    padding: 10,
    overflow: 'hidden',
  },
  vesselItemPressed: {
    opacity: 0.75,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  vesselAccentBar: {
    width: 3.5,
    borderRadius: 2,
    backgroundColor: '#10b981',
    marginRight: 10,
  },
  vesselContent: {
    flex: 1,
    gap: 2,
  },
  vesselRowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  vesselName: {
    fontFamily: FONTS.sansSemi,
    fontSize: 14,
    fontWeight: '700',
    color: '#f8fafc',
  },
  statusPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusPillText: {
    fontFamily: FONTS.sansSemi,
    fontSize: 11,
    fontWeight: '700',
  },
  vesselRoute: {
    fontFamily: FONTS.sans,
    fontSize: 12,
    color: '#94a3b8',
    lineHeight: 16,
  },
});
