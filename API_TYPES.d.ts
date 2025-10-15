/**
 * TypesXML Type Definitions
 * This file provides TypeScript type definitions for better IDE support and understanding
 * 
 * Key Features:
 * - Complete DTD validation support
 * - Automatic default attribute processing
 * - XML Catalog resolution
 */

export interface XMLNode {
    getNodeType(): number;
    toString(): string;
    equals(node: XMLNode): boolean;
}

export interface ContentHandler {
    initialize(): void;
    setCatalog(catalog: Catalog): void;
    startDocument(): void;
    endDocument(): void;
    xmlDeclaration(version: string, encoding: string, standalone: string | undefined): void;
    startElement(name: string, atts: XMLAttribute[]): void;
    endElement(name: string): void;
    internalSubset(declaration: string): void;
    characters(ch: string): void;
    ignorableWhitespace(ch: string): void;
    comment(ch: string): void;
    processingInstruction(target: string, data: string): void;
    startCDATA(): void;
    endCDATA(): void;
    startDTD(name: string, publicId: string, systemId: string): void;
    endDTD(): void;
    skippedEntity(name: string): void;
}

export declare class SAXParser {
    constructor();
    setContentHandler(contentHandler: ContentHandler): void;
    setValidating(validating: boolean): void;
    parseFile(path: string, encoding?: BufferEncoding): void;
    parseString(data: string): void;
}

export declare class DOMBuilder implements ContentHandler {
    constructor();
    getDocument(): XMLDocument | undefined;
    setCatalog(catalog: Catalog): void;
    initialize(): void;
    startDocument(): void;
    endDocument(): void;
    xmlDeclaration(version: string, encoding: string, standalone: string | undefined): void;
    startElement(name: string, atts: XMLAttribute[]): void;
    endElement(name: string): void;
    internalSubset(declaration: string): void;
    characters(ch: string): void;
    ignorableWhitespace(ch: string): void;
    comment(ch: string): void;
    processingInstruction(target: string, data: string): void;
    startCDATA(): void;
    endCDATA(): void;
    startDTD(name: string, publicId: string, systemId: string): void;
    endDTD(): void;
    skippedEntity(name: string): void;
}

export declare class XMLDocument implements XMLNode {
    constructor();
    getRoot(): XMLElement | undefined;
    setRoot(root: XMLElement): void;
    getXmlDeclaration(): XMLDeclaration | undefined;
    setXmlDeclaration(declaration: XMLDeclaration): void;
    getDocumentType(): XMLDocumentType | undefined;
    setDocumentType(documentType: XMLDocumentType): void;
    addComment(comment: XMLComment): void;
    addProcessingInstruction(pi: ProcessingInstruction): void;
    addTextNode(node: TextNode): void;
    contentIterator(): IterableIterator<XMLNode>;
    getNodeType(): number;
    toString(): string;
    equals(node: XMLNode): boolean;
}

export declare class XMLElement implements XMLNode {
    constructor(name: string);
    getName(): string;
    getNamespace(): string;
    hasAttribute(name: string): boolean;
    getAttribute(name: string): XMLAttribute | undefined;
    setAttribute(attribute: XMLAttribute): void;
    removeAttribute(name: string): void;
    setAttributes(array: XMLAttribute[]): void;
    getAttributes(): XMLAttribute[];
    addString(text: string): void;
    addTextNode(node: TextNode): void;
    addElement(node: XMLElement): void;
    addComment(node: XMLComment): void;
    addProcessingInstruction(node: ProcessingInstruction): void;
    addCData(node: CData): void;
    setContent(content: XMLNode[]): void;
    getContent(): XMLNode[];
    getChildren(): XMLElement[];
    getChild(childName: string): XMLElement | undefined;
    removeChild(child: XMLElement): void;
    getText(): string;
    getPI(target: string): ProcessingInstruction | undefined;
    getHead(): string;
    getTail(): string;
    getNodeType(): number;
    toString(): string;
    equals(node: XMLNode): boolean;
}

export declare class XMLAttribute implements XMLNode {
    constructor(name: string, value: string);
    getName(): string;
    getValue(): string;
    setValue(value: string): void;
    getNamespace(): string;
    getNodeType(): number;
    toString(): string;
    equals(node: XMLNode): boolean;
}

export declare class XMLDeclaration implements XMLNode {
    constructor(version: string, encoding: string, standalone?: string);
    getVersion(): string;
    getEncoding(): string;
    getStandalone(): string | undefined;
    getNodeType(): number;
    toString(): string;
    equals(node: XMLNode): boolean;
}

export declare class XMLDocumentType implements XMLNode {
    constructor(name: string, publicId: string, systemId: string);
    getName(): string;
    getPublicId(): string;
    getSystemId(): string;
    setInternalSubset(declaration: string): void;
    getInternalSubset(): string | undefined;
    getNodeType(): number;
    toString(): string;
    equals(node: XMLNode): boolean;
}

export declare class XMLComment implements XMLNode {
    constructor(value: string);
    getValue(): string;
    getNodeType(): number;
    toString(): string;
    equals(node: XMLNode): boolean;
}

export declare class TextNode implements XMLNode {
    constructor(value: string);
    getValue(): string;
    setValue(value: string): void;
    getNodeType(): number;
    toString(): string;
    equals(node: XMLNode): boolean;
}

export declare class CData implements XMLNode {
    constructor(value: string);
    getValue(): string;
    setValue(value: string): void;
    getNodeType(): number;
    toString(): string;
    equals(node: XMLNode): boolean;
}

export declare class ProcessingInstruction implements XMLNode {
    constructor(target: string, data: string);
    getTarget(): string;
    getData(): string;
    getNodeType(): number;
    toString(): string;
    equals(node: XMLNode): boolean;
}

export declare class XMLWriter {
    constructor(file: string);
    writeNode(node: XMLNode): void;
    writeString(str: string): void;
    static writeDocument(doc: XMLDocument, file: string): void;
}

export declare class XMLUtils {
    static cleanString(text: string): string;
    static unquote(text: string): string;
    static normalizeLines(text: string): string;
    static isXmlSpace(char: string): boolean;
    static hasParameterEntity(text: string): boolean;
    static normalizeSpaces(text: string): string;
    static replaceAll(text: string, search: string, replacement: string): string;
    static escapeRegExpChars(text: string): string;
    static validXml10Chars(text: string): string;
    static isValidXml10Char(c: number): boolean;
    static validXml11Chars(text: string): string;
    static isValidXml11Char(c: number): boolean;
    static lookingAt(search: string, text: string, start: number): boolean;
}

export declare class FileReader {
    constructor(path: string, encoding: BufferEncoding);
    read(): string;
    dataAvailable(): boolean;
    closeFile(): void;
    static detectEncoding(path: string): BufferEncoding;
}

export declare class Constants {
    static readonly DOCUMENT_NODE: number;
    static readonly ELEMENT_NODE: number;
    static readonly ATTRIBUTE_NODE: number;
    static readonly CDATA_SECTION_NODE: number;
    static readonly COMMENT_NODE: number;
    static readonly PROCESSING_INSTRUCTION_NODE: number;
    static readonly TEXT_NODE: number;
    static readonly ENTITY_DECL_NODE: number;
    static readonly XML_DECLARATION_NODE: number;
    static readonly ATTRIBUTE_LIST_DECL_NODE: number;
    static readonly DOCUMENT_TYPE_NODE: number;
    static readonly ATTRIBUTE_DECL_NODE: number;
    static readonly ELEMENT_DECL_NODE: number;
    static readonly INTERNAL_SUBSET_NODE: number;
    static readonly NOTATION_DECL_NODE: number;
}

export declare class Catalog {
    constructor(catalogFile: string);
    resolveEntity(publicId: string, systemId: string): string | undefined;
}

export declare class Indenter {
    constructor(spaces: number, level?: number);
    setSpaces(spaces: number): void;
    setLevel(level: number): void;
    indent(element: XMLElement): void;
}

// DTD Classes
export declare class DTDParser {
    constructor();
    setCatalog(catalog: Catalog): void;
    parseDTD(path: string): Grammar;
    parseInternalSubset(subset: string): Grammar;
}

export declare class Grammar {
    constructor();
    getContentModel(elementName: string): ContentModel | undefined;
    getElementDeclMap(): Map<string, ElementDecl>;
    getAttributesMap(): Map<string, Map<string, AttDecl>>;
    getElementAttributesMap(element: string): Map<string, AttDecl> | undefined;
    getEntitiesMap(): Map<string, EntityDecl>;
    getNotationsMap(): Map<string, NotationDecl>;
    getEntity(entityName: string): EntityDecl | undefined;
    addElement(elementDecl: ElementDecl): void;
    addAttributes(element: string, attributes: Map<string, AttDecl>): void;
    addEntity(entityDecl: EntityDecl): void;
    addNotation(notation: NotationDecl): void;
    merge(grammar: Grammar): void;
}

export declare class ElementDecl implements XMLNode {
    constructor(name: string, contentSpec: string);
    getName(): string;
    getContentSpec(): string;
    getNodeType(): number;
    toString(): string;
    equals(node: XMLNode): boolean;
}

export declare class AttListDecl implements XMLNode {
    constructor(name: string, attributesText: string);
    getName(): string;
    getAttributes(): Map<string, AttDecl>;
    parseAttributes(text: string): void;
    getNodeType(): number;
    toString(): string;
    equals(node: XMLNode): boolean;
}

export declare class AttDecl implements XMLNode {
    constructor(name: string, attType: string, defaultDecl: string, defaultValue: string);
    getName(): string;
    getType(): string;
    getDefaultDecl(): string;
    getDefaultValue(): string;
    isValid(value: string): boolean;
    getNodeType(): number;
    toString(): string;
    equals(node: XMLNode): boolean;
}

export declare class EntityDecl implements XMLNode {
    constructor(name: string, parameterEntity: boolean, value: string, systemId: string, publicId: string, ndata: string);
    getName(): string;
    getValue(): string;
    getSystemId(): string;
    getPublicId(): string;
    isParameterEntity(): boolean;
    getNodeType(): number;
    toString(): string;
    equals(node: XMLNode): boolean;
}

export declare class NotationDecl implements XMLNode {
    constructor(name: string, publicId: string, systemId: string);
    getName(): string;
    getPublicId(): string;
    getSystemId(): string;
    getNodeType(): number;
    toString(): string;
    equals(node: XMLNode): boolean;
}

export declare class InternalSubset implements XMLNode {
    constructor(content: string);
    getContent(): string;
    getNodeType(): number;
    toString(): string;
    equals(node: XMLNode): boolean;
}

export declare class ContentModel {
    constructor(content: Array<ContentParticle>, type: ContentModelType);
    static parse(modelString: string): ContentModel;
    getType(): ContentModelType;
    getContent(): Array<ContentParticle>;
    getChildren(): Set<string>;
    isMixed(): boolean;
    toString(): string;
}

export interface ContentParticle {
    getType(): number;
    addParticle(particle: ContentParticle): void;
    setCardinality(cardinality: number): void;
    getCardinality(): number;
    getParticles(): Array<ContentParticle>;
    getChildren(): Set<string>;
    toString(): string;
}

// DTD Constants
export declare const Cardinality: {
    readonly NONE: 0;
    readonly OPTIONAL: 1;
    readonly ZEROMANY: 2;
    readonly ONEMANY: 3;
};

export declare const ContentModelType: {
    readonly EMPTY: 'EMPTY';
    readonly ANY: 'ANY';
    readonly MIXED: 'Mixed';
    readonly PCDATA: '#PCDATA';
    readonly CHILDREN: 'Children';
};

export declare const ContentParticleType: {
    readonly PCDATA: 0;
    readonly NAME: 1;
    readonly SEQUENCE: 2;
    readonly CHOICE: 3;
};

// Type aliases for convenience
export type ContentModelType = 'EMPTY' | 'ANY' | 'Mixed' | '#PCDATA' | 'Children';
export type ContentParticleType = 0 | 1 | 2 | 3; // PCDATA | NAME | SEQUENCE | CHOICE
export type Cardinality = 0 | 1 | 2 | 3; // NONE | OPTIONAL | ZEROMANY | ONEMANY

// Utility Types
export type NodeType = 
    | typeof Constants.DOCUMENT_NODE
    | typeof Constants.ELEMENT_NODE
    | typeof Constants.ATTRIBUTE_NODE
    | typeof Constants.CDATA_SECTION_NODE
    | typeof Constants.COMMENT_NODE
    | typeof Constants.PROCESSING_INSTRUCTION_NODE
    | typeof Constants.TEXT_NODE
    | typeof Constants.ENTITY_DECL_NODE
    | typeof Constants.XML_DECLARATION_NODE
    | typeof Constants.ATTRIBUTE_LIST_DECL_NODE
    | typeof Constants.DOCUMENT_TYPE_NODE
    | typeof Constants.ATTRIBUTE_DECL_NODE
    | typeof Constants.ELEMENT_DECL_NODE
    | typeof Constants.INTERNAL_SUBSET_NODE
    | typeof Constants.NOTATION_DECL_NODE;