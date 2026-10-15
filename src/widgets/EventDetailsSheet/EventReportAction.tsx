import React, { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, Text, View } from 'react-native';
import { BlurView } from '@sbaiahmed1/react-native-blur';

import type { RoadEvent } from '../../entities/road-event/model/roadEvent';
import { useRoadEventReport } from '../../features/road-event-feedback/model/useRoadEventReport';
import { ApiError } from '../../shared/api/httpClient';
import { EVENT_REPORT_REASONS, EventReportReason } from './eventReport';
import { reportStyles } from './EventReportAction.styles';

export const EventReportAction = ({
  event,
  bottomInset = 0,
}: {
  event: RoadEvent;
  bottomInset?: number;
}) => {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<EventReportReason | null>(null);
  const report = useRoadEventReport();
  const failureMessage =
    report.error instanceof ApiError && report.error.status === 409
      ? 'На свою метку пожаловаться нельзя.'
      : report.error instanceof ApiError && report.error.status === 410
        ? 'Событие уже завершено или недоступно для жалобы.'
        : report.error instanceof ApiError && report.error.status === 429
          ? 'Слишком много жалоб за последний час. Попробуйте позже.'
          : 'Не удалось отправить жалобу. Проверьте подключение и попробуйте ещё раз.';

  const close = () => {
    setOpen(false);
    setReason(null);
  };

  const submit = (selectedReason: EventReportReason) => {
    setReason(selectedReason);
    report.reset();
    report.mutate({ eventId: event.id, reason: selectedReason });
  };

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Пожаловаться на событие"
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          reportStyles.trigger,
          pressed && reportStyles.pressed,
        ]}
      >
        <Text style={reportStyles.triggerText}>Пожаловаться на событие</Text>
        <Text style={reportStyles.triggerArrow} accessibilityElementsHidden>›</Text>
      </Pressable>

      <Modal
        transparent
        statusBarTranslucent
        presentationStyle="overFullScreen"
        animationType="slide"
        visible={open}
        onRequestClose={close}
      >
        <View style={reportStyles.overlay}>
          <BlurView
            testID="event-report-backdrop-blur"
            pointerEvents="none"
            blurType="systemThinMaterialLight"
            blurAmount={18}
            blurRounds={2}
            overlayColor="rgba(237,241,234,0.18)"
            reducedTransparencyFallbackColor="#E5ECE5"
            style={reportStyles.blurBackdrop}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Закрыть выбор причины жалобы"
            onPress={close}
            style={reportStyles.backdrop}
          />
          <View
            testID="event-report-sheet"
            style={[reportStyles.sheet, { paddingBottom: Math.max(bottomInset, 16) }]}
          >
            <Text style={reportStyles.title}>
              {reason ? 'Проверьте жалобу' : 'Почему вы жалуетесь?'}
            </Text>

            {reason ? (
              <>
                {report.isPending ? (
                  <View>
                    <ActivityIndicator />
                    <Text style={reportStyles.hint}>Отправляем жалобу…</Text>
                  </View>
                ) : report.isSuccess ? (
                  <Text style={reportStyles.hint}>
                    {report.data.duplicate
                      ? 'Эта жалоба уже учтена. Спасибо.'
                      : 'Жалоба передана на проверку. Спасибо.'}
                  </Text>
                ) : (
                  <Text style={reportStyles.errorText}>
                    {failureMessage}
                  </Text>
                )}
              </>
            ) : (
              EVENT_REPORT_REASONS.map(item => (
                <Pressable
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityLabel={item.label}
                  onPress={() => submit(item.id)}
                  style={({ pressed }) => [
                    reportStyles.reason,
                    pressed && reportStyles.pressed,
                  ]}
                >
                  <Text style={reportStyles.reasonText}>{item.label}</Text>
                </Pressable>
              ))
            )}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Отмена"
              onPress={close}
              style={reportStyles.secondaryButton}
            >
              <Text style={reportStyles.secondaryButtonText}>Отмена</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
};
