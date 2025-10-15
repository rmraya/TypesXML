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
- RelaxNG support

## Current Features

- **Complete DTD Support**: Full parsing of Document Type Definitions including:
  - Element declarations with content models (EMPTY, ANY, Mixed, Children)
  - Attribute list declarations with all attribute types
  - Entity declarations (parameter and general entities)
  - Notation declarations
  - Internal and external subset processing
- **Advanced Content Model Processing**:
  - Complex content model parsing (sequences, choices, cardinality)
  - Mixed content detection and validation
  - Element children resolution and integrity checking
- **Grammar Generation**: Complete Grammar instances from DTD parsing with:
  - Content model objects for each element
  - Attribute mappings with type and default value information
  - Entity resolution and parameter entity processing
  - Structural validation and cross-reference checking

## Limitations

- Validation not supported yet
- Default values for attributes are not set when parsing an element

## On the Roadmap

- Support for XML Schemas
- Support for RelaxNG

## Installation

```bash
npm install typesxml
```

## Example

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
