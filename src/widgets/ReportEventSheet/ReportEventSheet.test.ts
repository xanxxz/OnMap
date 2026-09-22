jest.mock(
  '../../shared/ui/BottomSheet/BottomSheet',
  () => ({
    BottomSheet: ({
      children,
    }: {
      children: unknown;
    }) => children,
  }),
);

import {
  canSubmitReportEvent,
} from './ReportEventSheet';

jest.mock('react-native-reanimated', () => {
  const ReactNative = require('react-native');
  const shared = (initial: number) => ({
    get: () => initial,
    set: jest.fn(),
  });

  return {
    __esModule: true,
    default: {View: ReactNative.View},
    ReduceMotion: {System: 'system'},
    useSharedValue: shared,
    useAnimatedStyle: (factory: () => unknown) => factory(),
    withSpring: (value: number) => value,
  };
});

describe('ReportEvent pending guard', () => {
  it('disables repeated create submission while a request is pending', () => {
    const input = {
      selectedType:
        'ACCIDENT' as const,
      coordinate: [
        47.8007,
        52.0278,
      ] as [number, number],
      locationValid: true,
    };

    expect(
      canSubmitReportEvent({
        ...input,
        isSubmitting: false,
      }),
    ).toBe(true);

    expect(
      canSubmitReportEvent({
        ...input,
        isSubmitting: true,
      }),
    ).toBe(false);
  });
});
