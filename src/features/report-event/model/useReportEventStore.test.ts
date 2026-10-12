import {useReportEventStore} from './useReportEventStore';

describe('event placement draft', () => {
  afterEach(() => useReportEventStore.getState().close());

  it('never moves a manually adjusted event point after a late GPS fix', () => {
    const store = useReportEventStore.getState();
    store.openForLocationLookup();
    store.selectType('ACCIDENT');
    store.setManualLocation([47.81, 52.02]);
    store.setCurrentLocation([47.82, 52.03], 8, 'READY');
    expect(useReportEventStore.getState().coordinate).toEqual([47.81, 52.02]);
    expect(useReportEventStore.getState().locationStatus).toBe('MANUAL');
  });

  it('allows an explicit fresh-location retry after manual adjustment', () => {
    const store = useReportEventStore.getState();
    store.openForLocationLookup();
    store.setManualLocation([47.81, 52.02]);
    store.beginLocationLookup();
    store.setCurrentLocation([47.82, 52.03], 8, 'READY');
    expect(useReportEventStore.getState().coordinate).toEqual([47.82, 52.03]);
    expect(useReportEventStore.getState().locationSource).toBe('CURRENT_LOCATION');
  });
});
