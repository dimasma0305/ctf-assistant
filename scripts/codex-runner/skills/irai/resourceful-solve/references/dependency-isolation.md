# Dependency fault isolation

Use during Searching when the problem may come from a library, framework, external service, or toolchain. Follow only the relevant branches.

The runtime reproduction steps below concern ordinary functional behavior. For a suspected security weakness, use defensive source/configuration analysis and benign control checks instead of exploit reproduction.

## Establish the boundary

Record the caller's input and expected contract, the actual dependency version/build, configuration, platform, and observed output/error. Check the installed artifact or lockfile rather than trusting an unverified version mentioned in a report. Remove secrets from the recorded input.

Check the installed version's documented API and upstream source. A valid dependency result can still be misinterpreted by the application. Validate units, encodings, types, default settings, lifecycle requirements, and supported version combinations where relevant.

## Run the discriminating experiment

Extract the smallest call that reproduces the symptom using synthetic or authorized local data. Run it outside the surrounding application on the same version and relevant settings. Compare it with a known documented example or simple reference result.

| Observation | Next interpretation or check |
| --- | --- |
| Isolated call matches the contract; application fails | Inspect caller logic, data conversion, state, and integration. |
| Isolated call fails on invalid or unsupported input | Correct usage or prerequisites before attributing a defect upstream. |
| Minimal valid call contradicts the documented contract | Investigate an upstream defect or platform/version mismatch. |
| Failure follows a configuration or environment change | Vary that factor alone; retain the input and version. |
| Failure occurs on one version but a supported version passes | Check release notes/source changes and integration compatibility. |
| A mocked external service passes but the real service is unavailable | Local logic has evidence; the complete integration remains unverified. |

For source inspection, obtain the exact release/tag or commit. Search the relevant function and its tests, then use upstream issues as leads. Record what matches the current case and what differs. Never treat a matching error message as sufficient proof of the same cause.

## Choose and prove a remedy

Prefer a caller correction when the dependency contract is satisfied, or a compatible supported fix when upstream evidence warrants it. Pin a changed dependency and update the project's lockfile through its normal tooling. Use a workaround only when its scope and maintenance cost are understood.

Demonstrate failure before and success after on the same input. Verify the isolated call and the actual application path, including nearby regressions. If only a workaround is established, label it as such; do not invent a precise root cause.
