# Data source policy

`dsh-stock-research` uses a provider adapter per data component, not a hidden whole-report fallback. A packet records the provider and endpoint for each successful component and reports failed components in `gaps`.

## Primary: Tushare

- Connection: HTTPS `POST https://api.tushare.pro`.
- Authentication: `TUSHARE_TOKEN` is sent only in the JSON request body.
- Intended use: A-share, Hong Kong, and supported US daily prices, financial indicators, valuation fields, and announcements.
- Entitlement: availability depends on account points and separately enabled endpoints. A provider denial is a normal partial-coverage result, not an exception to conceal.

See the [Tushare API catalog](https://tushare.pro/document/2?doc_id=129), including its stated Hong Kong and US sections and endpoint-specific permissions.

## Fallback: Alpha Vantage

- Connection: HTTPS query API.
- Authentication: `ALPHAVANTAGE_API_KEY`; URL logs are redacted.
- Intended use: daily time series, supported company overviews/income statements, and news sentiment.
- Limit: the public free tier is rate-limited. The plugin caps calls per research packet and caches each non-secret response.

See [Alpha Vantage API documentation](https://www.alphavantage.co/documentation/) and [premium/rate-limit information](https://www.alphavantage.co/premium/).

## Accuracy rules

1. Never call a data value real-time unless the data source, entitlement, and timestamp prove it.
2. Never mix monetary figures across currencies in a comparison without a disclosed FX conversion.
3. Do not treat provider content as a recommendation, target price, or verified corporate disclosure unless the packet includes its original URL.
4. Cache only provider responses and metadata; never cache secrets, authorization headers, or request URLs containing an API key.
5. Provider terms control data redistribution. Package users must supply their own credentials and permissions.
