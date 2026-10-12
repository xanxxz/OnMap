import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Alert, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import type {PartnerPoint} from '../../entities/partner-placement/model/partnerPlacement';
import {getPartnerContactUrl} from '../../entities/partner-placement/lib/partnerContactLink';
import {getPartnerAppearance} from '../../entities/partner-placement/lib/partnerAppearance';
import {PartnerArtwork} from '../../entities/partner-placement/ui/PartnerArtwork';
import {BottomSheet} from '../../shared/ui/BottomSheet/BottomSheet';
import {colors, radius, spacing, typography} from '../../shared/theme';

interface Props {
  point: PartnerPoint | null;
  onClose: () => void;
  onContactPress?: (pointId: string, contactId: string) => void;
}

export const PartnerPointSheet = ({point, onClose, onContactPress}: Props) => {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [displayPoint, setDisplayPoint] = useState<PartnerPoint | null>(null);
  const [promoCopyStatus, setPromoCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle');
  const promoStatusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const close = useCallback(() => setVisible(false), []);

  useEffect(() => {
    setPromoCopyStatus('idle');
    if (promoStatusTimer.current) clearTimeout(promoStatusTimer.current);
    return () => {
      if (promoStatusTimer.current) clearTimeout(promoStatusTimer.current);
    };
  }, [point?.id, point?.promoCode]);

  React.useEffect(() => {
    if (point) {
      setDisplayPoint(point);
      setMounted(true);
      setVisible(true);
    } else {
      setVisible(false);
    }
  }, [point]);

  const closed = useCallback(() => {
    setMounted(false);
    setDisplayPoint(null);
    onClose();
  }, [onClose]);

  const openContact = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('Не удалось открыть контакт', 'Попробуйте скопировать его из карточки.');
    }
  };
  const copyPromoCode = (code: string) => {
    try {
      Clipboard.setString(code);
      setPromoCopyStatus('copied');
    } catch {
      setPromoCopyStatus('error');
    }
    if (promoStatusTimer.current) clearTimeout(promoStatusTimer.current);
    promoStatusTimer.current = setTimeout(() => setPromoCopyStatus('idle'), 2400);
  };
  const primaryContactIndex = displayPoint?.contacts.findIndex(contact => getPartnerContactUrl(contact) !== null) ?? -1;
  const appearance = getPartnerAppearance(displayPoint?.appearance);
  const promoCode = displayPoint?.promoCode;

  return (
    <Modal transparent statusBarTranslucent visible={mounted} animationType="none" onRequestClose={close}>
      <BottomSheet visible={visible} offset={460} onClose={close} onClosed={closed}>
        {displayPoint ? (
          <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
            <View style={styles.artworkRow}><PartnerArtwork imageUrl={displayPoint.imageUrl} size={96} /></View>
            <View style={styles.headingRow}>
              <Text style={styles.title}>{displayPoint.title}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Закрыть карточку" onPress={close} style={styles.close}>
                <View style={styles.closeLine} />
                <View style={styles.closeLineCross} />
              </Pressable>
            </View>
            <Text testID="partner-category" style={[styles.category, {backgroundColor: appearance.backgroundColor, color: appearance.textColor, borderColor: appearance.textColor}]}>Партнёр · {displayPoint.category}</Text>
            {displayPoint.displayAddress ? (
              <Text style={styles.address}>{displayPoint.displayAddress}</Text>
            ) : null}
            {displayPoint.description ? (
              <Text style={styles.description}>{displayPoint.description}</Text>
            ) : null}
            {promoCode ? (
              <View style={styles.promo} testID="partner-promo">
                <View style={styles.promoCopy}>
                  <Text style={styles.promoLabel}>Промокод</Text>
                  <Text selectable style={styles.promoValue}>{promoCode}</Text>
                </View>
                <Pressable
                  testID="partner-promo-copy"
                  accessibilityRole="button"
                  accessibilityLabel="Скопировать промокод"
                  onPress={() => copyPromoCode(promoCode)}
                  style={({pressed}) => [styles.promoButton, pressed && styles.contactPressed]}
                >
                  <Text style={styles.promoButtonText}>{promoCopyStatus === 'copied' ? 'Скопировано' : 'Копировать'}</Text>
                </Pressable>
                {promoCopyStatus === 'error' ? (
                  <Text accessibilityRole="alert" style={styles.promoError}>Не удалось скопировать. Выделите код вручную.</Text>
                ) : null}
              </View>
            ) : null}
            {displayPoint.contacts.length ? (
              <View style={styles.contacts}>
                <Text style={styles.contactHeading}>Связаться</Text>
                {displayPoint.contacts.map((contact, index) => {
                  const url = getPartnerContactUrl(contact);
                  const primary = index === primaryContactIndex;
                  return url ? (
                    <Pressable
                      key={`${contact.type}-${index}`}
                      accessibilityRole="link"
                      accessibilityLabel={`${contact.label}: ${contact.value}`}
                      onPress={() => {
                        if (contact.id) onContactPress?.(displayPoint.id, contact.id);
                        openContact(url);
                      }}
                      style={({pressed}) => [
                        primary ? [styles.primaryContact, {backgroundColor: appearance.backgroundColor, borderColor: appearance.textColor}] : styles.contact,
                        pressed && styles.contactPressed,
                      ]}
                    >
                      <View style={styles.contactCopy}>
                        <Text style={primary ? [styles.primaryContactLabel, {color: appearance.textColor}] : styles.contactLabel}>{contact.label}</Text>
                        <Text selectable style={primary ? [styles.primaryContactValue, {color: appearance.textColor}] : styles.contactValue}>{contact.value}</Text>
                      </View>
                      <View style={primary ? [styles.primaryContactArrow, {borderColor: appearance.textColor}] : styles.contactArrow} accessible={false}>
                        <View style={primary ? [styles.primaryArrowHead, {borderColor: appearance.textColor}] : styles.arrowHead} />
                      </View>
                    </Pressable>
                  ) : (
                    <View key={`${contact.type}-${index}`} style={styles.contact}>
                      <View style={styles.contactCopy}>
                        <Text style={styles.contactLabel}>{contact.label}</Text>
                        <Text selectable style={styles.contactValue}>{contact.value}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : null}
          </ScrollView>
        ) : null}
      </BottomSheet>
    </Modal>
  );
};

const styles = StyleSheet.create({
  scroll: {maxHeight: 500},
  content: {paddingBottom: spacing[20]},
  artworkRow: {alignItems: 'center', marginBottom: spacing[16]},
  headingRow: {flexDirection: 'row', alignItems: 'flex-start', gap: spacing[12]},
  title: {...typography.title, color: colors.textPrimary, flex: 1, fontSize: 26, lineHeight: 32},
  close: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.round,
    backgroundColor: colors.surfaceMuted,
  },
  closeLine: {width: 16, height: 2, borderRadius: 1, backgroundColor: colors.brandForest, transform: [{rotate: '45deg'}]},
  closeLineCross: {position: 'absolute', width: 16, height: 2, borderRadius: 1, backgroundColor: colors.brandForest, transform: [{rotate: '-45deg'}]},
  category: {...typography.caption, color: colors.textInverse, backgroundColor: colors.brandForest, alignSelf: 'flex-start', paddingHorizontal: spacing[8], paddingVertical: spacing[4], borderRadius: radius[14], borderWidth: StyleSheet.hairlineWidth, borderColor: colors.textInverse, marginTop: spacing[2]},
  address: {...typography.caption, color: colors.textSecondary, marginTop: spacing[8]},
  description: {...typography.body, color: colors.textPrimary, marginTop: spacing[16]},
  promo: {flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing[8], marginTop: spacing[16], padding: spacing[12], borderRadius: radius[14], backgroundColor: colors.surfaceMuted},
  promoCopy: {flex: 1, minWidth: 140},
  promoLabel: {...typography.caption, color: colors.textSecondary},
  promoValue: {...typography.heading, color: colors.brandForest, marginTop: spacing[2]},
  promoButton: {minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing[12], borderRadius: radius[14], backgroundColor: colors.brandForest},
  promoButtonText: {...typography.caption, color: colors.textInverse},
  promoError: {...typography.caption, color: colors.textPrimary, flexBasis: '100%'},
  contacts: {marginTop: spacing[24]},
  contactHeading: {...typography.heading, color: colors.textPrimary, marginBottom: spacing[12]},
  contactPressed: {opacity: 0.72},
  primaryContact: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 72,
    paddingHorizontal: spacing[16],
    paddingVertical: spacing[12],
    borderRadius: radius[16],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.textInverse,
    backgroundColor: colors.brandForest,
  },
  contact: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 64,
    paddingVertical: spacing[12],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  contactCopy: {flex: 1, minWidth: 0},
  primaryContactLabel: {...typography.bodyMedium, color: colors.textInverse},
  primaryContactValue: {...typography.caption, color: colors.textInverse, opacity: 0.82, marginTop: spacing[2]},
  contactLabel: {...typography.bodyMedium, color: colors.brandForest},
  contactValue: {...typography.caption, color: colors.textSecondary, marginTop: spacing[2]},
  primaryContactArrow: {width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: radius.round, borderWidth: 1, borderColor: colors.textInverse},
  contactArrow: {width: 32, height: 32, alignItems: 'center', justifyContent: 'center'},
  primaryArrowHead: {width: 8, height: 8, marginRight: 3, borderTopWidth: 2, borderRightWidth: 2, borderColor: colors.textInverse, transform: [{rotate: '45deg'}]},
  arrowHead: {width: 8, height: 8, marginRight: 3, borderTopWidth: 2, borderRightWidth: 2, borderColor: colors.brandForest, transform: [{rotate: '45deg'}]},
});
