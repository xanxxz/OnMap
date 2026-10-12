import React from 'react';
import {act, create, ReactTestRenderer} from 'react-test-renderer';
import {PartnerArtwork} from './PartnerArtwork';

jest.mock('../../../shared/config/env', () => ({env: {apiBaseUrl: 'https://api.example.test/api'}}));

const imageUrl = '/partner-placements/images/b909ee9c-12a8-4c4c-8e3c-d89021525d55';

it('loads a partner image from the API and falls back after a failed download', () => {
  let renderer!: ReactTestRenderer;
  act(() => { renderer = create(<PartnerArtwork imageUrl={imageUrl} size={36} />); });
  const image = renderer.root.findByProps({testID: 'partner-artwork-image'});
  expect(image.props.source.uri).toBe(`https://api.example.test/api${imageUrl}`);
  expect(image.props.resizeMode).toBe('contain');
  act(() => image.props.onError());
  expect(renderer.root.findAllByProps({testID: 'partner-artwork-image'})).toHaveLength(0);
  expect(renderer.root.findAllByProps({testID: 'partner-artwork-fallback'}).length).toBeGreaterThan(0);
  act(() => renderer.update(<PartnerArtwork imageUrl={null} size={96} />));
  expect(renderer.root.findAllByProps({testID: 'partner-artwork-fallback'}).length).toBeGreaterThan(0);
  act(() => renderer.unmount());
});

it('never loads an untrusted external or traversal URL', () => {
  let renderer!: ReactTestRenderer;
  act(() => { renderer = create(<PartnerArtwork imageUrl="https://evil.test/image.png" size={36} />); });
  expect(renderer.root.findAllByProps({testID: 'partner-artwork-image'})).toHaveLength(0);
  act(() => renderer.unmount());
});
