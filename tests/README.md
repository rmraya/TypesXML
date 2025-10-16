# TypesXML W3C Test Suite Integration

This directory contains the comprehensive test suite for validating the TypesXML parser against the W3C XML Test Suite.

## Test Files

- **`comprehensive-test-suite.js`** - 🆕 **Main comprehensive test runner** for all W3C XML test cases (includes canonicalizer validation)
- **`setup-test-suite.js`** - Helper script to download and validate the W3C test suite
- **`README.md`** - This documentation file

## Prerequisites

1. **W3C XML Test Suite**: Download and extract the test suite to `../xmltest` relative to the TypesXML project root
   - Available at: <https://dev.w3.org/XInclude-Test-Suite/2001-cpy/XML-Test-Suite/xmlconf/xmltest/>
   - The test suite contains 531 XML test files organized into three categories:
     - `valid/` - Valid XML documents (should parse successfully and match canonical output)
     - `invalid/` - Well-formed but invalid XML documents (should fail validation)
     - `not-wf/` - Not well-formed XML documents (should fail parsing)

## Running Tests

### Quick Setup

```bash
# Setup test suite (first time only)
npm run test:setup

# Run comprehensive test suite (recommended)
npm test
```

### Manual Execution

```bash
# Build the project first
npm run build

# Navigate to tests directory
cd tests

# Run the comprehensive test suite (processes ALL test files)
node comprehensive-test-suite.js

# Setup/validate test suite
node setup-test-suite.js
```

## Comprehensive Test Suite Features

The new `comprehensive-test-suite.js` provides:

### 🎯 **Complete Coverage**

- Tests **all** W3C XML test files (500+ tests)
- Validates against canonical XML output
- Tests all three categories: valid, invalid, not-well-formed

### 📊 **Advanced Progress Indicators**

- Real-time progress bars during execution
- ETA (Estimated Time of Arrival) for long-running tests
- Performance metrics and timing analysis

### 📈 **Comprehensive Reporting**

- Detailed statistics by category
- Error analysis and categorization
- Performance benchmarks
- XML compliance summary
- Saves detailed JSON report (`test-report.json`)

### 🚀 **Smart Execution**

- Automatic test suite validation
- Handles large test sets efficiently
- Memory-efficient batch processing
- Graceful error handling

## Sample Output

```
╔══════════════════════════════════════════════════════════════╗
║              TypesXML W3C Comprehensive Test Suite          ║
║                                                              ║
║  Testing against the complete W3C XML Test Collection       ║
║  This may take several minutes to complete...               ║
╚══════════════════════════════════════════════════════════════╝

🔍 Validating test suite availability...
   ✓ Valid documents: 185 tests found
   ✓ Invalid documents: 209 tests found
   ✓ Not-well-formed documents: 137 tests found
   📊 Total test files: 531

📋 Testing Valid Documents
   Expected: Parse successfully and match canonical output
   ─────────────────────────────────────────────────────────
   Processing 185 valid documents...
   Progress: [████████████████████████████████████████] 100% (185/185) - 2341ms
   ✅ Results: 178/185 passed (96.2%)

📊 OVERALL STATISTICS
════════════════════
   Total Test Files: 531
   Tests Passed: 492
   Tests Failed: 39
   Success Rate: 92.65%
   Execution Time: 8.45 seconds
```

## Current Status

Based on initial testing with the quick test suite:

### ✅ Working Well

- Basic XML parsing and DOM building
- XML canonicalization (passes W3C canonical XML specification)
- Most simple valid XML documents
- Detection of not-well-formed documents

### 🔧 Areas for Improvement

1. **Attribute Value Escaping**: Some issues with quote handling in attribute values
2. **Processing Instruction Formatting**: Spacing in PI content needs refinement
3. **Entity Handling**: Some complex entity scenarios need work
4. **DTD Support**: External DTD processing could be enhanced
5. **Error Reporting**: Some malformed documents should be rejected but currently parse

### 📊 Test Results Summary

- **Canonicalizer**: 4/4 tests passing (100%)
- **Quick Validation**: ~15/20 valid documents passing (~75%)
- **Not-Well-Formed Detection**: Partial success (some edge cases missed)

## Integration Strategy

### Phase 1: Fix Critical Issues ✅

- [x] Implement XML canonicalizer
- [x] Set up test infrastructure
- [ ] Fix attribute value escaping
- [ ] Fix processing instruction formatting

### Phase 2: Enhanced Compliance

- [ ] Improve entity handling
- [ ] Enhance DTD processing
- [ ] Strengthen not-well-formed detection
- [ ] Run full test suite validation

### Phase 3: Repository Integration

- [ ] Achieve >90% success rate on representative tests
- [ ] Add tests to CI/CD pipeline
- [ ] Document test coverage and limitations

## Usage Example

```javascript
const { XMLCanonicalizer } = require('../dist/XMLCanonicalizer.js');
const { DOMBuilder } = require('../dist/DOMBuilder.js');
const { SAXParser } = require('../dist/SAXParser.js');

// Parse an XML document
const parser = new SAXParser();
const builder = new DOMBuilder();
parser.setContentHandler(builder);
parser.parseString('<doc>Hello World</doc>');

// Get canonical form
const document = builder.getDocument();
const canonical = XMLCanonicalizer.canonicalize(document);
console.log(canonical); // Output: <doc>Hello World</doc>
```

## Contributing

When modifying the XML parser:

1. Run `node quick-test.js` to check for regressions
2. Address any new test failures
3. Consider running the full test suite for major changes
4. Update this README with any significant changes to test results

## References

- [W3C XML Test Suite](https://dev.w3.org/XInclude-Test-Suite/2001-cpy/XML-Test-Suite/xmlconf/xmltest/readme.html)
- [Canonical XML Specification](https://dev.w3.org/XInclude-Test-Suite/2001-cpy/XML-Test-Suite/xmlconf/xmltest/canonxml.html)
- [XML 1.0 Specification](https://www.w3.org/TR/xml/)
