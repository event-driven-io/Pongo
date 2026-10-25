# Pongo shims

This package supplies the MongoDB type declarations used by Pongo's compatibility shim. It contains no runtime implementation and has no production dependencies.

Pongo users import types from `@event-driven-io/pongo/shim`; they do not need to reference this package directly. Types that share names with Pongo’s shim classes are available through the `MongoDB` type namespace. The upstream versions and redistribution notices are recorded in `NOTICE`; the original licenses are included in `licenses`.

The declarations reference upstream Node.js types even though this package contains no JavaScript runtime. Pongo's core and Cloudflare entry points do not import these declarations. Copies of upstream classes have their own private-member and unique-symbol identities, so the bundled declarations do not guarantee assignment compatibility with a separately installed MongoDB driver.
