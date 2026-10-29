# Changelog

## v1.0.3

- Fix the indexer being OOM-killed by scanned PDFs, which left the webhook stuck on the same batch ([#7](https://github.com/magda-io/magda-pdf-semantic-indexer/issues/7)):
  - Stop pdf.js from decoding page images while converting a PDF to Markdown. The output is unchanged, and peak memory for a 40.8 MB, 114-page scanned report drops from about 2 GiB to about 200 MiB.
  - Add a memory limit for the PDF-to-Markdown worker process (default 512 MiB). A PDF that needs more is skipped and logged instead of getting the whole container OOM-killed. Set it with the new Helm value `pdfWorkerMemoryLimitMiB` (`--pdfWorkerMemoryLimitMiB`); `0` disables it. Keep it below `resources.limits.memory`.
  - Fix worker output being truncated at 64 KiB on platforms where pipe writes are asynchronous (e.g. macOS).
  - Add regression tests for scanned PDFs.

## v1.0.2

- Upgrade to Node v24.22.1.

## v1.0.1

- Isolate pdf2md failures per record and keep text splitter compatibility ([#4](https://github.com/magda-io/magda-pdf-semantic-indexer/pull/4)).
- Make liveness probe timings configurable in the Helm chart and update defaults ([#5](https://github.com/magda-io/magda-pdf-semantic-indexer/pull/5)).

## v1.0.0

- Initial release.
