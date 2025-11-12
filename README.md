# TypesXML

Open source XML library written in TypeScript with DOM and SAX support. 

 - Full DTD parsing and validation. 
 - Full support for OASIS XML Catalogs.

## SAX Parser

TypesXML implements a SAX parser that exposes these methods from the `ContentHandler` interface:

* initialize(): void;
* setCatalog(catalog: Catalog): void;
* startDocument(): void;
* endDocument(): void;
* xmlDeclaration(version: string, encoding: string, standalone: string): void;
* startElement(name: string, atts: Array\<XMLAttribute>): void;
* endElement(name: string): void;
* internalSubset(declaration: string): void;
* characters(ch: string): void;
* ignorableWhitespace(ch: string): void;
* comment(ch: string): void;
* processingInstruction(target: string, data: string): void;
* startCDATA(): void;
* endCDATA(): void;
* startDTD(name: string, publicId: string, systemId: string): void;
* endDTD(): void;
* skippedEntity(name: string): void;

## DOM support

Class `DOMBuilder` implements the `ContentHandler` interface and builds a DOM tree from an XML document.

## On the Roadmap

* Support for XML Schemas
* Support for RelaxNG

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
