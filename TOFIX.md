# XML Schema Compliance Gaps

## XSDSemanticValidator

### Structural mutual-exclusion rules

- [X] §3.3.1 `xs:element` with `ref` cannot also have `name`, `type`, `nillable`, `default`, `fixed`, `abstract`
- [ ] §3.3.1 `xs:element` cannot have both `default` and `fixed`
- [ ] §3.2.3 `xs:attribute` with `use="required"` cannot have `default`
- [ ] §3.2.3 `xs:attribute` with `use="prohibited"` cannot have `fixed` or `default`
- [ ] §3.8.3 Within `xs:all`, each child element must have `maxOccurs` <= 1
- [ ] §3.8.1–3 `minOccurs`/`maxOccurs` must be non-negative integers (`maxOccurs` also allows `"unbounded"`)
- [ ] §3.4.1 `xs:simpleType` must have exactly one child: `xs:restriction`, `xs:list`, or `xs:union`
- [ ] §3.6.1 `xs:list` must have either an `itemType` attribute or exactly one inline `xs:simpleType` child, not both
- [ ] §3.7.1 `xs:union` must have at least one `memberTypes` item or inline `xs:simpleType` child
- [ ] §3.4.3 `xs:complexType` with `simpleContent` cannot also be `mixed="true"`
- [ ] §3.4.1 `xs:complexType` cannot have both `simpleContent` and `complexContent`

### Component uniqueness

- [X] §3.3.3 Duplicate top-level `xs:element` names (per namespace)
- [X] §3.4.3 Duplicate top-level `xs:complexType` names
- [X] §3.5.3 Duplicate top-level `xs:attributeGroup` names
- [X] §3.8.3 Duplicate top-level `xs:group` names
- [X] §3.11.3 Duplicate `xs:import` for absent namespace (`""`)

### Include/import namespace rules

- [X] §4.2.3 `xs:import` `namespace` must differ from the schema's own target namespace
- [X] §4.2.2 `xs:include` requires the included schema's target namespace to match or be absent

### Schema-level derivation rules

- [X] §3.4.4 `xs:complexType` restriction must not add attributes not present in the base type

## SchemaGrammar

### Identity constraints (§3.11)

- [X] §3.11.4.2 A nilled element (`xsi:nil="true"`) must contribute `undefined` to all identity constraint field slots (currently text is still collected for nilled elements)
- [X] §3.11.5 `xs:keyref` scope containment: when the keyref element is a descendant of the key/unique element, the keyref scope closes before the key scope, so `completedKeys` does not yet contain the key at keyref-close time — the check is silently skipped
- [X] §3.11.4 `xs:unique` uniqueness check must exclude any selected node with at least one absent field value — currently a partially-absent tuple still participates in the uniqueness check (should only error for `xs:key`)
- [X] §3.11.4 `xs:key` all-fields-absent tuple is silently skipped instead of raising an error — every selected node in an `xs:key` must have all fields present, so a fully-absent tuple must be an error
- [X] §3.11.3 `xs:keyref/@refer` may point to either `xs:key` or `xs:unique`, but only key scopes are stored in `completedKeys` — keyref references to `xs:unique` are never resolved and silently pass
- [X] §3.11.3 `xs:keyref` field count must equal the field count of the referenced `xs:key`/`xs:unique` — a mismatch makes the schema invalid but is not currently detected
- [X] §3.11.4 Multi-value field for `xs:unique`/`xs:keyref`: when a selected node has more than one value for a field, `pendingTupleOverflow` is only set for `xs:key` — for `xs:unique` and `xs:keyref` the node should be treated as unqualified (excluded), but instead the first value is kept and the node participates incorrectly
- [X] §3.11.3 `refer` namespace collision: `constraint.refer` stores only the local name, so `completedKeys` uses only the local name as key — two constraints from different imported namespaces with the same local name will collide
- [X] §3.11.5 `pendingKeyrefChecks` is never drained at end of document — if the referred key/unique is never found, the deferred keyref check is silently dropped with no error
- [ ] §3.11.4.3 `xsi:type` override ignored in text field canonicalization — `collectTextFields` always uses the schema-declared element type for `SchemaTypeValidator.canonicalize`; when `xsi:type` is present, the effective type is the substituted type and must be used instead
- [ ] §3.11.4.3 `xsi:type` override ignored in attribute field canonicalization — `collectAttributeFields` looks up attribute declarations via `elemDecl` (the declared element type) and ignores any `xsi:type`-substituted type's attribute declarations
- [ ] §3.11.4.3 Type-aware value equality: two field values with different primitive types must never compare equal (e.g. `xs:string "3.0"` ≠ `xs:decimal "3.0"`), but `tupleKey` is a raw string join with no type tag — once xsi:type canonicalization is fixed, the key must also encode the effective primitive type alongside the value

### XPath subset (Appendix C)

- [X] `xs:selector` supports `|`-separated alternative paths — only a single path is currently parsed
- [X] `.//` (`descendant::`) axis in selector/field XPath — only direct `./child/grandchild` steps are handled
- [X] Explicit `child::name` axis notation in selector/field — only bare name steps are handled

### Instance validation

- [X] §3.3.4 Element `default` value should be applied when element has no text content (only `fixed` is currently handled for element declarations)
- [X] §3.2.4 Confirm that default attribute values from `getDefaultAttributes()` are actually injected by the SAX layer before `validateAttributes` is called
