# TypesXML

Open source XML library written in TypeScript with DOM and SAX support.

✅ Fully passes the complete W3C XML Conformance Test Suite (valid, invalid, not-wf, and external entity cases).

- Full DTD parsing and validation.
- Full support for OASIS XML Catalogs.

## SAX Parser

TypesXML implements a SAX parser that exposes these methods from the `ContentHandler` interface:

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

## DOM support

Class `DOMBuilder` implements the `ContentHandler` interface and builds a DOM tree from an XML document.

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

## Running the W3C XML Test Suite

To exercise TypesXML against the full W3C XML Conformance Test Suite:

1. Download the latest archive from the [W3C XML Test Suite page](https://www.w3.org/XML/Test/)
    (for example, `xmlts20080827.zip`).
2. Extract the contents of the archive into the repository at `./tests/xmltest` so that the
    directory contains the `valid`, `invalid`, and `not-wf` folders from the suite.
3. Install project dependencies if you have not already done so: `npm install`.
4. Run the DTD regression command:

    ```bash
    npm run testDtd
    ```

The script compiles the TypeScript sources and executes the harness in
`ts/tests/DTDTestSuite.ts`, reporting any conformance failures.
