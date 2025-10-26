# TypesXML TODO List

This document tracks outstanding tasks, missing features, and improvements needed across the TypesXML codebase.

## Core Parser Features

### DTD Conditional Section Support

- **Location**: `ts/dtd/DTDParser.ts`
- **Description**: Conditional section parsing (`<![ ... ]]>`) is not currently supported in the DTD parser.
- **Details**:
  - Implement parsing and validation for INCLUDE/IGNORE conditional sections in DTDs
  - Support parameter entity expansion within conditional sections
  - Ensure correct grammar validation after expansion
  - Example test case: `tests/xmltest/valid/not-sa/022.xml` fails due to lack of conditional section support
- **Priority**: Medium
- **Status**: Not yet implemented

### XML Schema Support

#### Complex Type Extension and Derivation Implementation

- **Location**: `ts/schema/ComplexType.ts`, `ts/schema/XMLSchemaGrammar.ts`
- **Description**: Complex type extension and restriction validation needs implementation
- **Details**:
  - Implement runtime validation for complex type extensions (e.g., USAddress extending AddressType)
  - Support for `<complexContent><extension>` pattern validation
  - Inheritance chain validation for extended sequences
  - Type substitution with `xsi:type` attributes
  - Base type resolution and validation
- **Priority**: High
- **Status**: Framework ready with derivationMethod and baseType fields, needs validation logic

#### Simple Type Restriction Validation

- **Location**: `ts/schema/SimpleType.ts`, `ts/schema/BuiltinTypes.ts`
- **Description**: Simple type restrictions and facet validation needs enhancement
- **Details**:
  - Pattern validation (regex facets)
  - Length, minLength, maxLength validation
  - Enumeration validation
  - Range validation (minInclusive, maxInclusive, etc.)
  - Union and list type validation
- **Priority**: High
- **Status**: Basic framework exists, needs facet validation logic

#### Schema Imports and Includes

- **Location**: `ts/schema/XMLSchemaParser.ts`, `ts/schema/XMLSchemaGrammar.ts`
- **Description**: Support for importing and including external schemas
- **Details**:
  - `<xs:import>` statement processing
  - `<xs:include>` statement processing
  - Namespace resolution across imported schemas
  - Circular import detection and handling
- **Priority**: Medium
- **Status**: Parser structure ready, needs import/include logic

#### AnyParticle Content Validation Enhancement

- **Location**: `ts/schema/AnyParticle.ts`
- **Description**: Improve xs:any content validation and processing control
- **Details**:
  - Implement processContents validation (strict, lax, skip)
  - Add proper schema location hints processing
  - Enhance validation error reporting for any element validation
- **Priority**: Medium
- **Status**: Namespace validation implemented, needs processContents support

#### Identity Constraints

- **Location**: New classes needed in `ts/schema/`
- **Description**: Support for key, keyref, and unique constraints
- **Details**:
  - `<xs:key>`, `<xs:keyref>`, `<xs:unique>` element processing
  - XPath selector and field evaluation
  - Cross-element constraint validation
  - Constraint violation error reporting
- **Priority**: Medium
- **Status**: Not yet implemented

#### JSON Conversion Support

- **Location**: New module
- **Description**: Add bidirectional XML-JSON conversion capabilities
- **Details**:
  - **XML to JSON conversion**:
    - Convert XML documents to JSON format
    - Configurable conversion strategies (attributes as properties, arrays for repeated elements)
    - Preserve namespace information in JSON output
    - Handle mixed content and CDATA sections
  - **JSON to XML conversion**:
    - Convert JSON objects to well-formed XML
    - Support for custom element naming conventions
    - Configurable attribute vs element mapping
    - Root element wrapping options
  - **Configuration options**:
    - Custom conversion rules and mappings
    - Schema-aware conversion (when DTD/XSD available)
    - Formatting and indentation preferences
    - Namespace handling strategies
- **Priority**: Medium
- **Status**: To be implemented

#### RelaxNG Grammar Support

- **Location**: Grammar framework
- **Description**: Add RelaxNG schema validation support
- **Details**:
  - Create RelaxNGGrammar class implementing Grammar interface
  - Parse RelaxNG schemas (.rng files)
  - Implement RelaxNG validation rules
- **Priority**: Low
- **Status**: Framework ready, future implementation

#### XML Model Processing (DOMBuilder.ts:369)

- **Location**: `ts/DOMBuilder.ts`, line 369
- **Description**: Implement xml-model processing instruction support
- **Details**:
  - Parse xml-model processing instructions
  - Support different schema types (DTD, XSD, RelaxNG)
  - Automatic schema association
- **Priority**: Low

## Parser Architecture Enhancements

### Entity Content Processing

- **Location**: `ts/SAXParser.ts`, handleEntityContent method
- **Description**: Entity content handling needs improvement for complex markup cases
- **Details**:
  - Fix handling of entities with partial/malformed markup (e.g., `<!ENTITY e "</foo><foo>">`)
  - Proper well-formedness validation for entity-expanded content
  - Handle entities containing multiple elements or fragments
  - Improve markup detection beyond simple regex patterns
- **Priority**: Low
- **Impact**: Edge case handling, affects XML specification compliance

## Grammar Framework Improvements

### Cross-Schema Group Resolution Enhancement

- **Location**: `ts/grammar/CompositeGrammar.ts`, resolveAllGroupReferences method
- **Description**: Complete post-loading batch resolution for unresolved group references
- **Details**:
  - Core cross-schema resolution is implemented via `resolveCrossSchemaGroup`
  - Individual schema parsers have immediate and deferred resolution mechanisms
  - Optional: Implement batch post-loading resolution for edge cases with circular dependencies
- **Priority**: Low
- **Status**: Core functionality implemented, placeholder method remains for potential batch processing

### Advanced Namespace Resolution

- **Location**: `ts/grammar/CompositeGrammar.ts`, findElementNameForLookup method
- **Description**: Enhance context-aware element lookup for local elements
- **Details**:
  - Implement local element resolution with parent context (placeholder exists at line 1105-1107)
  - elementFormDefault handling is implemented and working
  - Basic qualified name resolution works for global elements
  - Missing: Context-aware lookup for local elements within complex types
- **Priority**: Medium
- **Status**: Global element resolution complete, local element context resolution needed

### Simple Type Validation Enhancement

- **Location**: `ts/grammar/CompositeGrammar.ts`, validateSimpleType method
- **Description**: Add union and list type validation to simple type validation
- **Details**:
  - Comprehensive built-in type validation is implemented via BuiltinTypes module
  - Restriction facets are implemented (pattern, length, enumeration, numeric ranges)
  - Missing: Union type validation (SimpleType.getVariety() === 'union')
  - Missing: List type validation (SimpleType.getVariety() === 'list')
- **Priority**: Medium
- **Status**: Atomic types and facets complete, union and list types need implementation

## Testing and Quality Assurance

### Error Reporting Enhancement

- **Location**: Throughout codebase
- **Description**: Improve error messages and debugging information
- **Details**:
  - Add line/column information to more error types
  - Context-aware error messages
  - Better validation error aggregation
- **Priority**: Medium

### Performance Optimization

- **Location**: Core parsing logic
- **Description**: Optimize parsing performance for large documents
- **Details**:
  - Buffer management optimization
  - Streaming parser improvements
  - Memory usage optimization
- **Priority**: Low

## Documentation and Developer Experience

### API Documentation Completion

- **Location**: Documentation files
- **Description**: Complete API documentation for all public interfaces
- **Details**:
  - Grammar interface documentation
  - Schema validation examples
  - Advanced configuration guides
- **Priority**: Medium

### TypeScript Type Definitions

- **Location**: Type definition files
- **Description**: Enhance TypeScript type definitions
- **Details**:
  - More specific return types
  - Better generic type constraints
  - Documentation comments in types
- **Priority**: Low

### Example Applications

- **Location**: Examples directory (to be created)
- **Description**: Create comprehensive example applications
- **Details**:
  - DTD validation examples
  - XML Schema validation examples
  - Catalog resolution examples
  - Custom Grammar implementation example
- **Priority**: Low

## Code Quality and Maintenance

### URI Validation Enhancement

- **Location**: `ts/schema/BuiltinTypes.ts`, validateAnyURI method
- **Description**: The URI validation is currently very basic and overly permissive
- **Details**:
  - Current implementation uses URL() constructor then falls back to allowing any non-empty string
  - Implement RFC 3986 compliant URI validation
  - Add proper validation for relative URIs vs absolute URIs
  - Support for different URI schemes with scheme-specific validation
  - Better error messages for invalid URI formats
- **Priority**: Low
- **Status**: Basic validation exists but needs comprehensive RFC compliance

## Future Enhancements

### XPath Expression Support

- **Location**: New module
- **Description**: Add XPath query support for DOM navigation
- **Details**:
  - Basic XPath 1.0 implementation
  - Integration with XMLDocument and XMLElement
  - Query optimization
- **Priority**: Low

### XSLT Transformation Support

- **Location**: New module
- **Description**: Add XSLT transformation capabilities
- **Details**:
  - XSLT 1.0 processor implementation
  - Integration with existing XML parsing
  - Template matching and transformation
- **Priority**: Very Low

### XML Signature Support

- **Location**: New module
- **Description**: Add XML Digital Signature support
- **Details**:
  - XML-DSIG implementation
  - Canonicalization support
  - Certificate validation
- **Priority**: Very Low

---

## Priority Legend

- **High**: Critical for core functionality, blocks major features
- **Medium**: Important for completeness, affects user experience
- **Low**: Nice to have, improves edge case handling
- **Very Low**: Future enhancements, not immediately needed

## Status Legend

- **Framework ready**: Architecture in place, needs implementation
- **Future implementation**: Planned for future releases
- **In progress**: Currently being worked on

---

*Last updated: October 2025*
*TypesXML Version: 2.0.0*
