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
          <View style={styles.headerTextContainer}>
            <Text style={styles.headerTitle} numberOfLines={1}>Morning Island Briefing</Text>
            <Text style={styles.headerSub} numberOfLines={1}>Real-time ferry & ship departures</Text>
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

      <View style={styles.seaWeatherBanner}>
        <View style={styles.seaWeatherRow}>
          <Text style={styles.seaWeatherIcon}>🌊</Text>
          <Text style={styles.seaWeatherText} numberOfLines={1}>
            Sea: Moderate • 1.2m Waves • Wind 14 kts
          </Text>
        </View>
        <View style={styles.seaWharfPill}>
          <View style={styles.seaGreenDot} />
          <Text style={styles.seaWharfText}>Wharf: Open</Text>
        </View>
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
    gap: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  headerTextContainer: {
    flex: 1,
    marginRight: 4,
  },
  iconBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: 'rgba(16, 185, 129, 0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  headerTitle: {
    fontFamily: FONTS.sansSemi,
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: -0.2,
  },
  headerSub: {
    fontFamily: FONTS.sans,
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 1,
  },
  syncBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    flexShrink: 0,
  },
  syncText: {
    fontFamily: FONTS.sansSemi,
    fontSize: 12,
    fontWeight: '600',
    color: '#10b981',
  },
  seaWeatherBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.22)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginBottom: 12,
  },
  seaWeatherRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    marginRight: 6,
  },
  seaWeatherIcon: {
    fontSize: 13,
  },
  seaWeatherText: {
    fontFamily: FONTS.sansSemi,
    fontSize: 11,
    fontWeight: '600',
    color: '#cbd5e1',
    flex: 1,
  },
  seaWharfPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(16, 185, 129, 0.16)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    flexShrink: 0,
  },
  seaGreenDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10b981',
  },
  seaWharfText: {
    fontFamily: FONTS.sansSemi,
    fontSize: 10,
    fontWeight: '700',
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
