# TypesXML

Open source XML library written in TypeScript

## Documentation

- **[Complete API Documentation](./API_DOCUMENTATION.md)** - Comprehensive guide with examples and API reference
- **[Quick Reference Guide](./QUICK_REFERENCE.md)** - Cheat sheet for common operations and usage patterns
- **[AI Agent Guidelines](./AI_AGENT_GUIDELINES.md)** - Performance, memory, and best practice guidelines for AI assistants
- **[Troubleshooting Guide](./TROUBLESHOOTING.md)** - Common issues, solutions, and debugging techniques
- **[Type Definitions](./API_TYPES.d.ts)** - TypeScript type definitions for better IDE support

## Licensing

TypesXML is available under a **dual licensing model**:

### 🆓 Open Source License (AGPL-3.0)

**Free for:**

- ✅ **Open source projects** (AGPL-compatible)
- ✅ **Personal and educational use**
- ✅ **Internal business tools** (with source sharing)
- ✅ **Research and development**

**Requirements under AGPL:**

- 📝 **Share source code** of your application
- 📝 **Use AGPL-compatible license** for your project
- 📝 **Provide source to users** (including SaaS users)

### 💼 Commercial License

**Required for:**

- ❌ **Proprietary software** distribution
- ❌ **SaaS applications** without source sharing
- ❌ **Commercial products** embedding TypesXML
- ❌ **Closed-source applications**

**Commercial license includes:**

- ✅ **No source sharing requirements**
- ✅ **Professional support and SLA**
- ✅ **Legal protection and indemnification**
- ✅ **Priority access to new features**

**📞 Commercial Licensing:** [sales@maxprograms.com](mailto:sales@maxprograms.com)

**📄 License Details:** [AGPL-3.0](./LICENSE) | [Commercial License](./LICENSE-COMMERCIAL.md)

## Overview

Implements a SAX parser that exposes these methods from the `ContentHandler` interface:

- initialize(): void;
- setCatalog(catalog: Catalog): void;
- startDocument(): void;
- endDocument(): void;
- xmlDeclaration(version: string, encoding: string, standalone: string): void;
- startElement(name: string, atts: Array\<XMLAttribute>): void;
- endElement(name: string): void;
- internalSubset(declaration: string): void;
- characters(ch: string): void;
- ignorableWhitespace(ch: string): void;
- comment(ch: string): void;
- processingInstruction(target: string, data: string): void;
- startCDATA(): void;
- endCDATA(): void;
- startDTD(name: string, publicId: string, systemId: string): void;
- endDTD(): void;
- skippedEntity(name: string): void;

Class `DOMBuilder` implements the `ContentHandler` interface and builds a DOM tree from an XML document.

## Features currently in development

- XML Schema validation support  
- RelaxNG validation support

## Current Features

- **Complete DTD Support with Validation**: Full parsing and validation of Document Type Definitions including:
  - Element declarations with content models (EMPTY, ANY, Mixed, Children)
  - Attribute list declarations with all attribute types
  - Entity declarations (parameter and general entities)
  - Notation declarations
  - Internal and external subset processing
  - **Full DTD Validation**: Complete validation against DTD constraints including sequences, choices, and cardinality
  - **Flexible Validation Modes**: Strict validation with `setValidating(true)` or helpful processing with `setValidating(false)`
  - **Unreachable DTD Handling**: Graceful fallback when DTD files are unavailable
- **Advanced Content Model Processing**:
  - Complex content model parsing (sequences, choices, cardinality)
  - Mixed content detection and validation
  - Element children resolution and integrity checking
  - **Full Content Model Validation**: Complete validation of element sequences, choice groups, and cardinality constraints
- **Grammar Generation**: Complete Grammar instances from DTD parsing with:
  - Content model objects for each element
  - Attribute mappings with type and default value information
  - Entity resolution and parameter entity processing
  - Structural validation and cross-reference checking
- **Default Attribute Processing**: Automatic setting of default attribute values from DTD declarations:
  - Direct default values: `attr CDATA "default-value"`
  - Fixed declarations: `attr CDATA #FIXED "fixed-value"`
  - Enumeration defaults: `format (html|dita) "dita"`
  - **DITA Processing Ready**: Automatically sets essential `@class` attributes for DITA workflows
- **Helpful Behavior Philosophy**: DTD parsing and default attribute setting occurs even in non-validating mode
- **Catalog Support**: Full XML Catalog resolution for DTD and entity references
- **Enterprise-Grade Error Handling**: Comprehensive validation with detailed error reporting for:
  - Missing required elements and attributes
  - Invalid element sequences and content models
  - Cardinality violations (wrong number of occurrences)
  - Undeclared elements and attributes
  - Invalid attribute values and types

## Limitations

- XML Schema validation not supported yet (on roadmap)
- RelaxNG validation not supported yet (on roadmap)

## On the Roadmap

- Support for XML Schemas (XSD validation)
- Support for RelaxNG schemas
- Enhanced namespace processing
- Performance optimizations for large documents

## Installation

```bash
npm install typesxml
```

## Example

### Basic Usage

```TypeScript
import { ContentHandler } from "./ContentHandler";
import { DOMBuilder } from "./DOMBuilder";
import { SAXParser } from "./SAXParser";
import { XMLDocument } from "./XMLDocument";
import { XMLElement } from "./XMLElement";

export class Test {

    constructor() {
        try {
            let contentHandler: ContentHandler = new DOMBuilder();
            let xmlParser = new SAXParser();
            xmlParser.setContentHandler(contentHandler);

            // build the document from a file
            xmlParser.parseFile("test.xml");
            let doc: XMLDocument = (contentHandler as DOMBuilder).getDocument();
            let root: XMLElement = doc.getRoot();
            console.log(doc.toString());

            //  build the document again, this time from a string
            xmlParser.parseString(doc.toString());
            let newDoc : XMLDocument = (contentHandler as DOMBuilder).getDocument();
            console.log(newDoc.toString());

        } catch (error: any) {
            if (error instanceof Error) {
                console.log(error.message);
            } else {
                console.log(error);
            }
        }
    }
}

new Test();
```

### DTD Validation and Default Attributes

```TypeScript
import { DOMBuilder } from "./DOMBuilder";
import { SAXParser } from "./SAXParser";
import { Catalog } from "./Catalog";
import { XMLWriter } from "./XMLWriter";
import { Indenter } from "./Indenter";

// Example with DTD validation and default attributes
const ditaXml = `<?xml version="1.0"?>
<!DOCTYPE concept PUBLIC "-//OASIS//DTD DITA Concept//EN" "concept.dtd">
<concept id="example">
    <title>Example Topic</title>
    <conbody>
        <p>This paragraph will get default @class attributes automatically.</p>
    </conbody>
</concept>`;

try {
    const parser = new SAXParser();
    const builder = new DOMBuilder();
    
    // Catalog setup for DTD resolution:
    // - Required if DTD uses PUBLIC identifiers that need resolution
    // - Optional if DTD files are accessible via system ID or local paths
    const catalog = new Catalog('/path/to/catalog.xml');
    builder.setCatalog(catalog);
    
    // Enable strict DTD validation
    parser.setValidating(true);
    parser.setContentHandler(builder);
    
    // Parse the document with validation
    parser.parseString(ditaXml);
    const doc = builder.getDocument();
    
    // Check if default attributes were added (depends on DTD availability)
    const root = doc?.getRoot();
    const classAttr = root?.getAttribute('class');
    if (classAttr) {
        console.log(`Root @class: ${classAttr.getValue()}`);
        // Output when DTD is available: "- topic/topic concept/concept "
    } else {
        console.log('No @class attribute found (DTD not available)');
    }
    
    // Prettify the document with proper indentation
    const indenter = new Indenter(2); // 2 spaces per level
    const root = doc?.getRoot();
    if (root) {
        indenter.indent(root);
    }
    
    // Write the processed and prettified document
    XMLWriter.writeDocument(doc!, 'output.xml');
    
} catch (error: any) {
    if (error.message.includes('validation')) {
        console.log('DTD Validation Error:', error.message);
        // Handle validation errors appropriately
    } else {
        console.log('Parsing Error:', error.message);
    }
}
```

### DTD Validation Examples

```TypeScript
// Example: Strict validation that rejects invalid documents
const invalidXml = `<?xml version="1.0"?>
<!DOCTYPE book [
  <!ELEMENT book (title, author+, chapter*)>
  <!ELEMENT title (#PCDATA)>
  <!ELEMENT author (#PCDATA)>
]>
<book>
  <title>Book Title</title>
  <!-- Missing required author+ elements - will cause validation error -->
</book>`;

const parser = new SAXParser();
const builder = new DOMBuilder();
parser.setValidating(true); // Enable strict validation
parser.setContentHandler(builder);

try {
    parser.parseString(invalidXml);
    console.log('Document is valid');
} catch (error) {
    console.log('Validation failed:', error.message);
    // Output: "Content model validation failed for element 'book': Required content particle '(title,author+,chapter*)' not satisfied"
}
```

```TypeScript
import { DOMBuilder } from "./DOMBuilder";
import { SAXParser } from "./SAXParser";
import { Catalog } from "./Catalog";
import { XMLWriter } from "./XMLWriter";
import { Indenter } from "./Indenter";

// Example with DTD validation and default attributes
const ditaXml = `<?xml version="1.0"?>
<!DOCTYPE concept PUBLIC "-//OASIS//DTD DITA Concept//EN" "concept.dtd">
<concept id="example">
    <title>Example Topic</title>
    <conbody>
        <p>This paragraph will get default @class attributes automatically.</p>
    </conbody>
</concept>`;

try {
    const parser = new SAXParser();
    const builder = new DOMBuilder();
    
    // Catalog setup for DTD resolution:
    // - Required if DTD uses PUBLIC identifiers that need resolution
    // - Optional if DTD files are accessible via system ID or local paths
    const catalog = new Catalog('/path/to/catalog.xml');
    builder.setCatalog(catalog);
    
    // Enable validation (optional - default attributes work in both modes)
    parser.setValidating(true);
    parser.setContentHandler(builder);
    
    // Parse the document
    parser.parseString(ditaXml);
    const doc = builder.getDocument();
    
    // Check if default attributes were added (depends on DTD availability)
    const root = doc?.getRoot();
    const classAttr = root?.getAttribute('class');
    if (classAttr) {
        console.log(`Root @class: ${classAttr.getValue()}`);
        // Output when DTD is available: "- topic/topic concept/concept "
    } else {
        console.log('No @class attribute found (DTD not available)');
    }
    
    // Prettify the document with proper indentation
    const indenter = new Indenter(2); // 2 spaces per level
    const root = doc?.getRoot();
    if (root) {
        indenter.indent(root);
    }
    
    // Write the processed and prettified document
    XMLWriter.writeDocument(doc!, 'output.xml');
    
} catch (error: any) {
    console.log('Error:', error.message);
}
```

**When DTD is available and contains default attribute declarations:**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE concept PUBLIC "-//OASIS//DTD DITA Concept//EN" "concept.dtd">
<concept id="example" class="- topic/topic concept/concept ">
  <title class="- topic/title ">Example Topic</title>
  <conbody class="- topic/body  concept/conbody ">
    <p class="- topic/p ">This paragraph will get default @class attributes automatically.</p>
  </conbody>
</concept>
```

**When DTD is not available (graceful fallback):**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE concept PUBLIC "-//OASIS//DTD DITA Concept//EN" "concept.dtd">
<concept id="example">
  <title>Example Topic</title>
  <conbody>
    <p>This paragraph will get default @class attributes automatically.</p>
  </conbody>
</concept>
```
