# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Users

Residents and drivers who need a quick, trustworthy view of current road conditions in their city while planning or making a trip.

## Product Purpose

OnMap brings together current road events from residents and external sources on one map, helping people understand what is happening nearby without pretending that approximate information is exact.

## Positioning

OnMap combines live community confirmations with clearly communicated location precision: exact points are shown as points, while street- and area-level reports remain visibly approximate.

## Operating Context

The primary surface is a mobile map. People scan nearby events, open event details, report an event, confirm whether it remains current, or say that it has ended. The interface must remain legible outdoors and avoid encouraging prolonged interaction while driving.

## Capabilities and Constraints

- React Native application for iOS and Android.
- The map remains the primary interface.
- Existing map providers, event contracts, realtime behavior, storage, bundle identifiers, application IDs, and domain names such as `RoadEvent` remain technical constraints.
- First-run onboarding is local and versioned; it does not require a backend account.
- Event source and location precision must remain explicit.
- The application must not imply guaranteed road safety or perfect data completeness.

## Brand Commitments

- User-facing brand name: OnMap.
- Brand character: calm, natural, airy, modern, safe, urban, and premium without decorative eco clichés.
- Supplied visual reference: `/Users/daniil/Downloads/3e9976e2-282a-4be7-80be-66b02a217c1a.png`.
- Core message: roads, people, events, and safety are closer together on one living map.

## Evidence on Hand

- Existing functional map, event reporting, feedback, Telegram/TomTom sources, city configuration, and realtime updates in this repository.
- Supplied OnMap identity moodboard and wordmark direction.
- No standalone production-ready vector logo asset or licensed custom font files are currently present in the repository.

## Product Principles

1. Map first: the road context remains visible and usable.
2. Honest precision: approximate data must look and read as approximate.
3. Calm urgency: important events are clear without turning the interface into an alarm dashboard.
4. Community maintenance: reporting and confirmations improve freshness without technical language.
5. Safety before engagement: interactions remain short, readable, and secondary to the real road.

## Accessibility & Inclusion

- Interactive targets should be at least 44 points.
- Text and controls require readable contrast in outdoor conditions.
- Safe-area, Dynamic Island, home indicator, smaller phones, and system reduced-motion preferences must be respected.
