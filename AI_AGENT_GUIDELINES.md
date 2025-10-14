# TypesXML AI Agent Guidelines

## Performance & Memory Optimization

### Buffer Management

- The SAXParser uses a minimum buffer size of 2048 bytes (`SAXParser.MIN_BUFFER_SIZE`)
- For large files, the parser reads incrementally and expands buffer as needed
- **AI Recommendation**: For very large XML files (>100MB), suggest custom ContentHandler over DOMBuilder to avoid memory issues

### Memory Usage Patterns

```typescript
// Memory-efficient for large files
class LargeFileHandler implements ContentHandler {
    // Process elements without storing entire DOM
}

// Memory-intensive for large files  
const builder = new DOMBuilder(); // Stores entire DOM in memory
```

### Performance Considerations

- File parsing is more efficient than string parsing (string parsing creates temp files)
- Encoding detection adds small overhead - specify encoding when known
- DTD parsing is optional and adds processing time

## XML Standards Compliance

### Supported XML Versions

- XML 1.0 (default)
- XML 1.1 (when specified in declaration)
- Character validation differs between versions

### What's NOT Supported

- **Schema Validation**: No XSD, RelaxNG validation yet
- **Namespace Processing**: Limited namespace support
- **External Entity Resolution**: Requires manual catalog setup
- **Default Attribute Values**: Not automatically applied from DTD

### Well-formedness vs. Validity

```typescript
// Library checks well-formedness, NOT validity
parser.parseString('<root><unclosed>'); // Throws error - not well-formed
parser.parseString('<root><child/></root>'); // Parses fine - well-formed
```

## Entity Resolution & Catalogs

### When to Use Catalogs

```typescript
// Use when XML references external DTDs
const catalog = new Catalog('catalog.xml');
const builder = new DOMBuilder();
builder.setCatalog(catalog);

// Without catalog, external references may fail
```

### Entity Types Supported

- Built-in entities (`&lt;`, `&gt;`, `&amp;`, `&apos;`, `&quot;`)
- Character references (`&#65;`, `&#x41;`)
- External entities via catalog resolution

## Error Handling & Edge Cases

### Common Error Scenarios

1. **Missing ContentHandler**: "ContentHandler not set"
2. **Malformed XML**: "unclosed elements", "text found in prolog"
3. **Encoding Issues**: Specify encoding explicitly when possible
4. **File Access**: Check file existence before parsing

### Graceful Degradation

```typescript
// AI should recommend this pattern
try {
    parser.parseFile(file, encoding);
} catch (error) {
    // Fallback strategies based on error type
    if (error.message.includes('encoding')) {
        // Try different encoding
    } else if (error.message.includes('not found')) {
        // Handle missing file
    }
}
```

## Use Case Decision Matrix

### When to Recommend SAXParser + DOMBuilder

- **File size**: < 50MB
- **Need**: DOM manipulation, XPath-like queries
- **Memory**: Sufficient RAM available

### When to Recommend SAXParser + Custom Handler

- **File size**: > 50MB or streaming data
- **Need**: Extract specific data, transform on-the-fly
- **Memory**: Limited RAM or performance critical

### When to Recommend XMLWriter

- **Creating XML**: Always prefer over string concatenation
- **Encoding**: Automatic BOM handling for UTF-16LE
- **File output**: Better than manual file writing

## Integration Patterns

### With Node.js Streams

```typescript
// AI should suggest this for large files
class StreamingXMLProcessor {
    processChunks(xmlStream: ReadableStream) {
        // Process XML in chunks rather than loading all at once
    }
}
```

### With Express.js

```typescript
// Validate XML in middleware
app.use('/api/xml', (req, res, next) => {
    try {
        const parser = new SAXParser();
        // Validate before processing
    } catch (error) {
        return res.status(400).json({ error: 'Invalid XML' });
    }
});
```

### With TypeScript Strict Mode

```typescript
// Always check for undefined/null with strict mode
const doc = builder.getDocument();
if (!doc) return;  // Required check

const root = doc.getRoot();
if (!root) return; // Required check
```

## DTD and Grammar Features

### Current DTD Support

- Element declarations (`<!ELEMENT>`)
- Attribute list declarations (`<!ATTLIST>`)
- Entity declarations (`<!ENTITY>`)
- Notation declarations (`<!NOTATION>`)
- Internal subsets
- External DTD references

### DTD Limitations

- No validation against DTD rules
- Parameter entities supported but limited
- Conditional sections supported
- No default attribute value application

## Namespace Handling

### Current Support

```typescript
// Basic namespace detection
element.getNamespace(); // Returns prefix before ':'
element.getName();      // Returns full name including prefix
```

### Limitations

- No namespace URI resolution
- No namespace context management
- No namespace validation

## AI Agent Recommendations

### Code Quality Checks

1. **Always check return values** for undefined/null
2. **Use try-catch** around all parsing operations
3. **Specify encoding** when known to avoid detection overhead
4. **Choose appropriate ContentHandler** based on use case
5. **Use XMLWriter** for XML generation, not string concatenation

### Performance Optimization

1. **File size assessment**: Recommend streaming for large files
2. **Memory profiling**: Suggest custom handlers for memory-constrained environments
3. **Encoding specification**: Reduce parsing overhead
4. **Incremental processing**: Break large operations into chunks

### Error Prevention

1. **Input validation**: Check file existence, encoding validity
2. **Resource cleanup**: Ensure FileReader.closeFile() is called
3. **Error propagation**: Provide meaningful error messages
4. **Fallback strategies**: Handle common failure scenarios

### Best Practices Enforcement

1. **Null safety**: Enforce null checks in TypeScript strict mode
2. **Resource management**: Proper file handle cleanup
3. **Encoding consistency**: UTF-8 default, explicit when needed
4. **Error boundaries**: Isolate XML processing errors

## Common Anti-patterns to Avoid

### Memory Leaks

```typescript
// BAD: Parser instance reuse without cleanup
const parser = new SAXParser();
// Process multiple files without proper cleanup

// GOOD: Fresh parser instances or proper cleanup
for (const file of files) {
    const parser = new SAXParser();
    // Process file
}
```

### Unsafe Type Assumptions

```typescript
// BAD: Assuming non-null returns
const root = doc.getRoot().getName(); // May throw

// GOOD: Null checking
const root = doc.getRoot();
if (root) {
    const name = root.getName();
}
```

### String Concatenation for XML

```typescript
// BAD: Manual XML construction
let xml = '<?xml version="1.0"?><root>';
xml += '<child>' + data + '</child>';
xml += '</root>';

// GOOD: Using library classes
const doc = new XMLDocument();
const root = new XMLElement('root');
// ... proper construction
```

This guide should help AI agents provide more accurate, safe, and efficient recommendations when working with the TypesXML library.
