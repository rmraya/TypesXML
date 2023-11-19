import { ContentHandler } from "./ContentHandler";
import { TextNode } from "./TextNode";
import { XMLAttribute } from "./XMLAttribute";
import { XMLComment } from "./XMLComment";
import { XMLDeclaration } from "./XMLDeclaration";
import { XMLDocument } from "./XMLDocument";
import { XMLElement } from "./XMLElement";
import { ProcessingInstruction } from "./ProcessingInstruction";
import { CData } from "./CData";
import { XMLDocumentType } from "./XMLDocumentType";

export class DOMBuilder implements ContentHandler {

    inCdData: boolean;
    currentCData: CData;
    document: XMLDocument;
    stack: Array<XMLElement>;

    constructor() {
        this.document = new XMLDocument();
        this.stack = new Array();
        this.inCdData = false;
    }

    getDocument(): XMLDocument {
        return this.document;
    }

    startDocument(): void {
        // do nothing
    }

    endDocument(): void {
        // do nothing
    }

    xmlDeclaration(version: string, encoding: string, standalone: string): void {
        let xmlDclaration = new XMLDeclaration(version, encoding, standalone);
        this.document.setXmlDeclaration(xmlDclaration);
    }

    startElement(name: string, atts: XMLAttribute[]): void {
        let element: XMLElement = new XMLElement(name);
        atts.forEach((att) => {
            element.setAttribute(att);
        });
        if (this.stack.length > 0) {
            this.stack[this.stack.length - 1].addElement(element);
        } else {
            this.document.setRoot(element);
        }
        this.stack.push(element);
    }

    endElement(name: string): void {
        this.stack.pop();
    }

    internalSubset(declaration: string): void {
        let docType: XMLDocumentType = this.document.getDocumentType();
        if (docType) {
            docType.setInternalSubset(declaration);
        }
    }

    characters(ch: string): void {
        if (this.inCdData) {
            this.currentCData.setValue(this.currentCData.getValue() + ch);
            return;
        }
        let textNode: TextNode = new TextNode(ch);
        if (this.stack.length > 0) {
            this.stack[this.stack.length - 1].addTextNode(textNode);
        } else {
            this.document.addTextNode(textNode);
        }
    }

    ignorableWhitespace(ch: string): void {
        let textNode: TextNode = new TextNode(ch);
        if (this.stack.length > 0) {
            this.stack[this.stack.length - 1].addTextNode(textNode);
        } else {
            this.document.addTextNode(textNode);
        }
    }

    comment(ch: string): void {
        let comment: XMLComment = new XMLComment(ch);
        if (this.stack.length > 0) {
            this.stack[this.stack.length - 1].addComment(comment);
        } else {
            this.document.addComment(comment);
        }
    }

    processingInstruction(target: string, data: string): void {
        let pi = new ProcessingInstruction(target, data);
        if (this.stack.length > 0) {
            this.stack[this.stack.length - 1].addProcessingInstruction(pi);
        } else {
            this.document.addProcessingInstruction(pi);
        }
    }

    startCDATA(): void {
        this.currentCData = new CData('');
        this.inCdData = true;
    }

    endCDATA(): void {
        if (this.stack.length > 0) {
            this.stack[this.stack.length - 1].addCData(this.currentCData);
        } else {
            throw new Error("CData section outside of root element");
        }
        this.inCdData = false;
    }

    startDTD(name: string, publicId: string, systemId: string): void {
        let docType: XMLDocumentType = new XMLDocumentType(name, publicId, systemId);
        this.document.setDocumentType(docType);
    }

    endDTD(): void {
        // do nothing
    }

    skippedEntity(name: string): void {
        throw new Error("Method not implemented.");
    }
}