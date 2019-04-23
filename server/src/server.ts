/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
	createConnection,
	TextDocuments,
	TextDocument,
	Diagnostic,
	DiagnosticSeverity,
	ProposedFeatures,
	InitializeParams,
	DidChangeConfigurationNotification,
	CompletionItem,
	CompletionItemKind,
	TextDocumentPositionParams,
	Hover,
	RequestType0,
	CodeActionContext,
	HoverRequest
} from 'vscode-languageserver';
import { createDiffieHellman } from 'crypto';
import { connect } from 'tls';

// Create a connection for the server. The connection uses Node's IPC as a transport.
// Also include all preview / proposed LSP features.
let connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager. The text document manager
// supports full document sync only
let documents: TextDocuments = new TextDocuments();
let waitForDict = new RegExp("\\s(with|if|and|or|by-exp|total|by-exp-dsnd|break-on)\\s", "i")

let hasConfigurationCapability: boolean = false;
let hasWorkspaceFolderCapability: boolean = false;
let hasDiagnosticRelatedInformationCapability: boolean = false;
let FileNames = [""];
let CurrentFile: any;
let getDictList = "";
let getItemList = "";
let DictNames = [];
let Dictionaries: DictionaryDefinition[] = [];
let Files: FileDefinition[] = [];

class DictionaryDetail {
	Name: string;
	Type: string;
	FieldNo: string;
	Heading: string;
	Conversion: string;
	Width: string;
	MvType: string;
	constructor(name: string, type: string, fieldno: string, heading: string, conversion: string, width: string, mvtype: string) {
		this.Name = name;
		this.Type = type;
		this.FieldNo = fieldno;
		this.Heading = heading;
		this.Conversion = conversion;
		this.Width = width;
		this.MvType = mvtype;
	}
}
class FileDefinition {
	FileName: string;
	ItemList: string[];
	constructor(FileName: string, ItemList: string[]) {
		this.FileName = FileName;
		this.ItemList = ItemList;
	}
}

class DictionaryDefinition {
	FileName: string;
	DictionaryItems: DictionaryDetail[];
	constructor(FileName: string, DictionaryItems: DictionaryDetail[]) {
		this.FileName = FileName;
		this.DictionaryItems = DictionaryItems;
	}
}
function GetDictionaryDetail(FileName: string, DictName: string): DictionaryDetail {
	for (var i = 0; i < Dictionaries.length; i++) {
		if (Dictionaries[i].FileName === FileName) {

			for (var j = 0; j < Dictionaries[i].DictionaryItems.length; j++) {
				if (Dictionaries[i].DictionaryItems[j].Name === DictName) {
					return Dictionaries[i].DictionaryItems[j];
				}
			}

		}
	}
	return null;
}
function AddDictionary(FileName: string, DictionaryItems: DictionaryDetail[]): void {
	let found: boolean = false;
	for (var i = 0; i < Dictionaries.length; i++) {
		if (Dictionaries[i].FileName === FileName) {
			found = true;
			break;
		}
	}
	if (found === false) {
		Dictionaries.push(new DictionaryDefinition(FileName, DictionaryItems));
	}
}

function GetDictionary(FileName: string): string[] {
	if (Dictionaries === undefined) { return []; }
	for (var i = 0; i < Dictionaries.length; i++) {
		if (Dictionaries[i].FileName === FileName) {
			let items: string[] = [];
			for (var j = 0; j < Dictionaries[i].DictionaryItems.length; j++) {
				items.push(Dictionaries[i].DictionaryItems[j].Name)
			}
			return items;
		}
	}
	return [];
}
function AddFile(FileName: string, ItemList: string[]): void {
	let found: boolean = false;
	for (var i = 0; i < Files.length; i++) {
		if (Files[i].FileName === FileName) {
			found = true;
			break;
		}
	}
	if (found === false) {
		Files.push(new FileDefinition(FileName, ItemList));
	}
}

function GetFile(FileName: string): string[] {
	if (Files === undefined) { return []; }
	for (var i = 0; i < Files.length; i++) {
		if (Files[i].FileName === FileName) {
			return Files[i].ItemList;
		}
	}
	return [];
}

function CheckFile(FileName: string): boolean {
	if (Files === undefined) { return false; }
	for (var i = 0; i < Files.length; i++) {
		if (Files[i].FileName === FileName) {
			return true;
		}
	}
	return false;
}

function CheckDictionary(FileName: string): boolean {
	if (Dictionaries === undefined) { return false; }
	for (var i = 0; i < Dictionaries.length; i++) {
		if (Dictionaries[i].FileName === FileName) {
			return true;
		}
	}
	return false;
}

connection.onInitialize((params: InitializeParams) => {
	let capabilities = params.capabilities;

	// Does the client support the `workspace/configuration` request?
	// If not, we will fall back using global settings
	hasConfigurationCapability =
		capabilities.workspace && !!capabilities.workspace.configuration;
	hasWorkspaceFolderCapability =
		capabilities.workspace && !!capabilities.workspace.workspaceFolders;
	hasDiagnosticRelatedInformationCapability =
		capabilities.textDocument &&
		capabilities.textDocument.publishDiagnostics &&
		capabilities.textDocument.publishDiagnostics.relatedInformation;

	return {
		capabilities: {
			textDocumentSync: documents.syncKind,
			// Tell the client that the server supports code completion
			completionProvider: {
				resolveProvider: true

			},
			hoverProvider: true
		}
	};
});
connection.onHover(async (event): Promise<Hover> => {

	let document: TextDocument = documents.get(event.textDocument.uri);
	let lineNo = event.position.line;
	let charCount = event.position.character;
	let lines = document.getText().split(/\r?\n/g);
	let line = lines[lineNo];
	let word = "";
	let start = 0;
	let end = 0;
	while (charCount > 0) {
		// scan forward to a space
		charCount++
		if (charCount === line.length - 1 || line[charCount] === " ") {
			end = charCount;
			while (charCount > 0) {
				charCount--;
				if (line[charCount] === " ") {
					start = charCount + 1;
					break;
				}
			}


			break;
		}
		if (charCount >= line.length) {
			break;
		}
	}
	word = line.substr(start, end - start);
	// now get the file name
	let parts = line.split(' ');
	let fNamePos = 1;
	// skip extra spaces
	while (parts[fNamePos] === "") {
		fNamePos++;
	}
	if (CheckDictionary(parts[fNamePos])) {
		let dictItem = GetDictionaryDetail(parts[fNamePos], word);
		if (dictItem != null) {
			return {

				contents: {
					language: documents.get(event.textDocument.uri).languageId,
					// we put the signature at the top of the completion detail
					value: "Field Name : " + word + "\r\Dict Type  : " + dictItem.Type + "\r\nField No   : " + dictItem.FieldNo + "\r\nConversion : " + dictItem.Conversion + "\r\nHeading    : " + dictItem.Heading + "\r\nWidth      : " + dictItem.Width + "\r\nType       : " + dictItem.MvType
				}
			} as Hover
		}
	}
	return null;
})
connection.onInitialized(() => {
	if (hasConfigurationCapability) {
		// Register for all configuration changes.
		connection.client.register(
			DidChangeConfigurationNotification.type,
			undefined
		);
	}
	if (hasWorkspaceFolderCapability) {
		connection.workspace.onDidChangeWorkspaceFolders(_event => {
			connection.console.log('Workspace folder change event received.');
		});
	}

});

// The example settings
interface ExampleSettings {
	maxNumberOfProblems: number;
}

// The global settings, used when the `workspace/configuration` request is not supported by the client.
// Please note that this is not the case when using this server with the client provided in this example
// but could happen with other clients.
const defaultSettings: ExampleSettings = { maxNumberOfProblems: 1000 };
let globalSettings: ExampleSettings = defaultSettings;

// Cache the settings of all open documents
let documentSettings: Map<string, Thenable<ExampleSettings>> = new Map();

connection.onDidChangeConfiguration(change => {
	if (hasConfigurationCapability) {
		// Reset all cached document settings
		documentSettings.clear();
	} else {
		globalSettings = <ExampleSettings>(
			(change.settings.languageServerExample || defaultSettings)
		);
	}

	// Revalidate all open text documents
	documents.all().forEach(validateTextDocument);
});

connection.onRequest("FileList", (params) => {
	FileNames = [];
	FileNames = params.split("|");
})
connection.onRequest("SetFileItems", (params) => {
	let parts = params.split(String.fromCharCode(2))
	{
		let itemList: string[] = [];
		itemList = parts[1].split(String.fromCharCode(1));
		AddFile(parts[0], itemList)
	}
})
connection.onRequest("SetDictionary", (params) => {

	let parts = params.split(String.fromCharCode(2))
	{
		let dictItems: DictionaryDetail[] = [];
		let items = parts[1].split(String.fromCharCode(1));
		if (items.length === 0) {
			AddDictionary(parts[0], dictItems);
			return;
		}
		for (var i = 0; i < items.length; i++) {
			let attr = items[i].split(String.fromCharCode(254))
			switch (attr[1].substr(0, 1)) {
				case "D":
				case "I":
				case "V":
					let ddetail: DictionaryDetail = new DictionaryDetail(attr[0], attr[1], attr[2], attr[4], attr[3], attr[5], attr[6])
					dictItems.push(ddetail)
					break;
				case "A":
				case "S":
					let adetail: DictionaryDetail = new DictionaryDetail(attr[0], attr[1], attr[2], attr[3], attr[8], attr[9] + attr[10], "")
					dictItems.push(adetail)
					break;
			}

		}
		AddDictionary(parts[0], dictItems);
	}
})
function getDocumentSettings(resource: string): Thenable<ExampleSettings> {
	if (!hasConfigurationCapability) {
		return Promise.resolve(globalSettings);
	}
	let result = documentSettings.get(resource);
	if (!result) {
		result = connection.workspace.getConfiguration({
			scopeUri: resource,
			section: 'languageServerExample'
		});
		documentSettings.set(resource, result);
	}
	return result;
}

// Only keep settings for open documents
documents.onDidClose(e => {
	documentSettings.delete(e.document.uri);
});

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent(change => {

	validateTextDocument(change.document);
});

async function validateTextDocument(textDocument: TextDocument): Promise<void> {
	// In this simple example we get the settings for every validate run.
	let settings = await getDocumentSettings(textDocument.uri);

	// The validator creates diagnostics for all uppercase words length 2 and more
	let text = textDocument.getText();
	let pattern = /\b[A-Z]{2,}\b/g;
	let startVerbs = new RegExp('^(select|sselect|list|count|sort|create.index|delete.index)\\s', 'i')
	let itemVerbs = new RegExp("^(basic|compile|run|catalog|decatalog|ct|list.item)\\s", 'i')
	let assignVerbs = new RegExp('^(=|#|>|>=|<|<=|GT |LT |LE |GE |NE )')
	let validNumber = new RegExp('(^\\d*\\.?\\d*$)')
	let m: RegExpExecArray;

	let problems = 0;
	let diagnostics: Diagnostic[] = [];
	let lines = textDocument.getText().split(/\r?\n/g);

	getDictList = "";
	getItemList = "";

	// check we have a valid file name for various verbs

	for (var i = 0; i < lines.length; i++) {
		let line = lines[i];
		let words = line.trim().split(' ');
		// remove white space from the array
		words = words.filter(function (x) {
			return (x !== (undefined || null || ''));
		});
		// check if we need an itemlist for various verbs
		itemVerbs.lastIndex = 0;
		if (itemVerbs.test(line) === true) {
			if (words.length > 1) {
				if (FileNames.indexOf(words[1]) === -1) {
					let diagnosic: Diagnostic = {
						severity: DiagnosticSeverity.Error,
						range: {
							start: { line: i, character: words[0].length },
							end: { line: i, character: words[0].length + words[1].length }
						},
						message: 'Invalid Filename ' + words[1],
						source: 'TCL'
					};
					if (hasDiagnosticRelatedInformationCapability) {
						diagnosic.relatedInformation = [
							{
								location: {
									uri: textDocument.uri,
									range: Object.assign({}, diagnosic.range)
								},
								message: 'The Filename does exist in this account'
							}
						];
					}
					diagnostics.push(diagnosic);
				}
				else {
					// file is valid store for dictionary testing
					CurrentFile = words[1];
					if (CheckFile(CurrentFile) === false) {
						// get list of files to get there dictionaries
						getItemList += "|" + CurrentFile;
					}

				}
			}

		}
		if (startVerbs.test(line) === true) {
			let fileNamePos = 1;
			let addLength = 1;
			if (words[1] === "DICT") {
				fileNamePos = 2;
				addLength = 5;
			}
			if (FileNames.indexOf(words[fileNamePos]) === -1) {
				let diagnosic: Diagnostic = {
					severity: DiagnosticSeverity.Error,
					range: {
						start: { line: i, character: words[0].length + addLength },
						end: { line: i, character: words[0].length + words[1].length + addLength }
					},
					message: 'Invalid Filename ' + words[fileNamePos],
					source: 'TCL'
				};
				if (hasDiagnosticRelatedInformationCapability) {
					diagnosic.relatedInformation = [
						{
							location: {
								uri: textDocument.uri,
								range: Object.assign({}, diagnosic.range)
							},
							message: 'The Filename does exist in this account'
						}
					];
				}
				diagnostics.push(diagnosic);
			}
			else {
				// file is valid store for dictionary testing
				CurrentFile = words[1];
				if (CheckDictionary(CurrentFile) === false) {
					// get list of files to get there dictionaries
					getDictList += "|" + CurrentFile;

				}

			}
		}

		let pos = 0;
		DictNames = GetDictionary(CurrentFile);
		for (var j = 0; j < words.length - 1; j++) {
			waitForDict.lastIndex = 0;
			assignVerbs.lastIndex = 0;
			let validForDict = waitForDict.test(' ' + words[j] + ' ');
			let validOperator = assignVerbs.test(words[j]);
			pos += words[j].length + 1;
			// check for value or dictionary id after operator
			if (validOperator === true) {
				// next word must be string number or dictionary item
				let validWord: boolean = false;
				if (j === words.length) {
					// end of line
					validWord = false;
				}
				else {
					let nextWord = words[j + 1];
					let isNumber = validNumber.test(nextWord);
					if (DictNames.indexOf(nextWord) != -1) {
						validWord = true;
					}
					if (nextWord.startsWith("'") || nextWord.startsWith('"') || nextWord.startsWith("\\")) {
						validWord = true;
					}
					if (isNumber === true) {
						validWord = true;
					}


				}
				if (validWord === false) {
					let diagnosic: Diagnostic = {
						severity: DiagnosticSeverity.Error,
						range: {
							start: { line: i, character: pos },
							end: { line: i, character: pos + words[j].length }
						},
						message: 'Expecting Value or Dictionary Item after Opertor ' + words[j],
						source: 'TCL'
					};
					if (hasDiagnosticRelatedInformationCapability) {
						diagnosic.relatedInformation = [
							{
								location: {
									uri: textDocument.uri,
									range: Object.assign({}, diagnosic.range)
								},
								message: 'A value or dictionary item is required after an operator'
							}
						];
					}
					diagnostics.push(diagnosic);
				}

			}

			// check that dictionary names are valid
			if (validForDict === true) {

				if (j === words.length - 1) {
					let diagnosic: Diagnostic = {
						severity: DiagnosticSeverity.Error,
						range: {
							start: { line: i, character: pos - words[j].length },
							end: { line: i, character: pos }
						},
						message: 'Expecting Dictionary Name after ' + words[j],
						source: 'TCL'
					};
					if (hasDiagnosticRelatedInformationCapability) {
						diagnosic.relatedInformation = [
							{
								location: {
									uri: textDocument.uri,
									range: Object.assign({}, diagnosic.range)
								},
								message: 'Dictionary Name expected after modifier'
							}
						];
					}
					diagnostics.push(diagnosic);
				}
				let wPos = j;
				// ignore the with if it is and with
				if (words[wPos].toLocaleLowerCase() == "and" && words[wPos + 1].toLocaleLowerCase() == "with") { wPos++; }
				wPos++;
				if (DictNames.indexOf(words[wPos]) === -1) {
					let diagnosic: Diagnostic = {
						severity: DiagnosticSeverity.Error,
						range: {
							start: { line: i, character: pos },
							end: { line: i, character: pos + words[j + 1].length }
						},
						message: 'Invalid Dictionary Name ' + words[j + 1],
						source: 'TCL'
					};
					if (hasDiagnosticRelatedInformationCapability) {
						diagnosic.relatedInformation = [
							{
								location: {
									uri: textDocument.uri,
									range: Object.assign({}, diagnosic.range)
								},
								message: 'The Dictionary Item does not exist in this file'
							}
						];
					}
					diagnostics.push(diagnosic);
				}

			}
		}



	}

	// Send the computed diagnostics to VSCode.
	connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
	if (getDictList != "") {
		connection.sendRequest("GetDictList", getDictList).then(undefined, (_error) => {
			getDictList = ""

		});;

	}
	if (getItemList != "") {
		connection.sendRequest("GetItemList", getItemList).then(undefined, (_error) => {
			getItemList = ""

		});;
	}
}

connection.onDidChangeWatchedFiles(_change => {
	// Monitored files have change in VSCode
	connection.console.log('We received an file change event');
});

// This handler provides the initial list of the completion items.
connection.onCompletion(
	(_textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
		// The pass parameter contains the position of the text document in
		// which code complete got requested. For the example we ignore this
		// info and always provide the same completion items.
		// if we are waiting for a file name the return list of files
		let lineNo = _textDocumentPosition.position.line;
		let charCount = _textDocumentPosition.position.character;
		let document = documents.get(_textDocumentPosition.textDocument.uri);
		let lines = document.getText().split(/\r?\n/g);
		let line = lines[lineNo].toLocaleLowerCase();
		let baseLine = lines[lineNo];
		let baseWords = baseLine.split(' ');
		let waitForFileName = new RegExp("^(ct|list.item|select|sselect|list|sort|count|delete.file|create.index|delete.index|basic|run|catalog|decatalog)\\s", "i")
		// verbs that conform to "verb filename itemname"
		let fileNameDictname = new RegExp("^(create.index|delete.index)\\s", "i");
		let previousCheck = new RegExp("(from|to)")
		let itemVerbs = new RegExp("^(basic|compile|run|catalog|decatalog|ct|list.item)\\s", 'i')
		// lets get the previous word and check for some specific keywords
		let words = line.substr(0, _textDocumentPosition.position.character).trim().split(' ');
		// remove white space from the array
		words = words.filter(function (x) {
			return (x !== (undefined || null || ''));
		});
		let lastWord = words[words.length - 1];
		let nextIsFileName = waitForFileName.test(line);
		let validForFile = previousCheck.test(lastWord);
		let wordCount = words.length;
		CurrentFile = baseWords[1];
		let result: CompletionItem[] = [];
		// check if we are sending an item list
		if (itemVerbs.test(line) === true) {
			if (words.length >= 2) {
				if (CheckFile(CurrentFile) === true) {
					let itemList = GetFile(CurrentFile);
					for (let i = 0; i < itemList.length; i++) {
						result.push({ label: itemList[i], kind: CompletionItemKind.Class, data: 999 })
					}
					return result;
				}
			}
		}
		// check if we are looking for a file name
		if ((nextIsFileName === true && wordCount === 2) || validForFile === true) {
			for (let i = 0; i < FileNames.length; i++) {
				result.push({ label: FileNames[i], kind: CompletionItemKind.Module, data: 999 })
			}
			return result;

		}
		// check if we are looking for a dictionary
		let validForDict = waitForDict.test(' ' + lastWord + ' ');
		if (fileNameDictname.test(line) === true) {
			if (wordCount == 3) {
				validForDict = true;
			}
			if (wordCount > 3) {
				return null;
			}
		}
		// specific intellisense for CREATE.FILE
		if (words.length > 0 && words[0].toLocaleLowerCase() === "create.file") {
			if (wordCount >= 3) {
				let displayType = false;
				if (words[2].toLocaleLowerCase() === "type=") { displayType = true; }
				if (wordCount >= 4 && words[3] === "=") { displayType = true; }
				if (displayType === true) {
					result = [
						{ label: 'SqlArray', kind: CompletionItemKind.Method, data: 999 },
						{ label: 'Directory', kind: CompletionItemKind.Function, data: 999 },
						{ label: 'Hashed', kind: CompletionItemKind.Function, data: 999 },
						{ label: 'MongoDB', kind: CompletionItemKind.Function, data: 999 },
						{ label: 'Universe', kind: CompletionItemKind.Function, data: 999 },
						{ label: 'Unidata', kind: CompletionItemKind.Function, data: 999 },
					]
					return result;

				}

			}

		}
		if (validForDict === true) {
			DictNames = GetDictionary(CurrentFile);
			for (let i = 0; i < DictNames.length; i++) {
				result.push({ label: DictNames[i], kind: CompletionItemKind.Reference, data: 999 })
			}
			return result;
		}

		// return intellisense for TCL commands
		result = [
			{ label: 'SELECT', kind: CompletionItemKind.Method, data: 1 },
			{ label: 'WITH', kind: CompletionItemKind.Function, data: 2 },
			{ label: 'FROM', kind: CompletionItemKind.Function, data: 3 },
			{ label: 'TO', kind: CompletionItemKind.Function, data: 4 },
			{ label: 'COPY', kind: CompletionItemKind.Function, data: 5 },
			{ label: 'SSELECT', kind: CompletionItemKind.Function, data: 6 },
			{ label: 'SORT', kind: CompletionItemKind.Function, data: 7 },
			{ label: 'LIST', kind: CompletionItemKind.Function, data: 8 },
			{ label: 'COUNT', kind: CompletionItemKind.Function, data: 9 },
			{ label: 'SAVE.LIST', kind: CompletionItemKind.Function, data: 10 },
			{ label: 'COUNT', kind: CompletionItemKind.Function, data: 11 },
			{ label: 'TOTAL', kind: CompletionItemKind.Function, data: 12 },
			{ label: 'BY', kind: CompletionItemKind.Function, data: 13 },
			{ label: 'BY.EXP', kind: CompletionItemKind.Function, data: 14 },
			{ label: 'BASIC', kind: CompletionItemKind.Function, data: 15 },
			{ label: 'COMPILE', kind: CompletionItemKind.Function, data: 15 },
			{ label: 'DEBUG', kind: CompletionItemKind.Function, data: 16 },
			{ label: 'RUN', kind: CompletionItemKind.Function, data: 17 },
			{ label: 'CATALOG', kind: CompletionItemKind.Function, data: 18 },
			{ label: 'LISTF', kind: CompletionItemKind.Function, data: 19 },
			{ label: 'LISTFILES', kind: CompletionItemKind.Function, data: 19 },
			{ label: 'MESSAGE', kind: CompletionItemKind.Function, data: 20 },
			{ label: 'PORT.STATUS', kind: CompletionItemKind.Function, data: 21 },
			{ label: 'BREAK.ON', kind: CompletionItemKind.Function, data: 22 },
			{ label: 'LISTU', kind: CompletionItemKind.Function, data: 23 },
			{ label: 'SEARCH', kind: CompletionItemKind.Function, data: 24 },
			{ label: 'OFF', kind: CompletionItemKind.Function, data: 25 },
			{ label: 'QUIT', kind: CompletionItemKind.Function, data: 25 },
			{ label: 'BYE', kind: CompletionItemKind.Function, data: 25 },
			{ label: 'LO', kind: CompletionItemKind.Function, data: 25 },
			{ label: 'LOGOUT', kind: CompletionItemKind.Function, data: 25 },
			{ label: 'LISTPTR', kind: CompletionItemKind.Function, data: 26 },
			{ label: 'LIST.ITEM', kind: CompletionItemKind.Function, data: 27 },
			{ label: 'CT', kind: CompletionItemKind.Function, data: 27 },
			{ label: 'LOCK', kind: CompletionItemKind.Function, data: 28 },
			{ label: 'LIST.LOCKS', kind: CompletionItemKind.Function, data: 29 },
			{ label: 'CLEAR.LOCKS', kind: CompletionItemKind.Function, data: 30 },
			{ label: 'CLEARCOMMON', kind: CompletionItemKind.Function, data: 31 },
			{ label: 'AND', kind: CompletionItemKind.Function, data: 32 },
			{ label: 'OR', kind: CompletionItemKind.Function, data: 33 },
			{ label: 'LIST.READU', kind: CompletionItemKind.Function, data: 34 },
			{ label: 'UNLOCK', kind: CompletionItemKind.Function, data: 35 },
			{ label: 'CD', kind: CompletionItemKind.Function, data: 36 },
			{ label: 'COMPILE.DICT', kind: CompletionItemKind.Function, data: 36 },
			{ label: 'CLR', kind: CompletionItemKind.Function, data: 37 },
			{ label: 'DISPLAY', kind: CompletionItemKind.Function, data: 38 },
			{ label: 'SLEEP', kind: CompletionItemKind.Function, data: 39 },
			{ label: 'DATE', kind: CompletionItemKind.Function, data: 40 },
			{ label: 'TIME', kind: CompletionItemKind.Function, data: 41 },
			{ label: 'GET.LIST', kind: CompletionItemKind.Function, data: 42 },
			{ label: 'EDIT.LIST', kind: CompletionItemKind.Function, data: 43 },
			{ label: 'DELETE.LIST', kind: CompletionItemKind.Function, data: 44 },
			{ label: 'CREATE.INDEX', kind: CompletionItemKind.Function, data: 45 },
			{ label: 'DELETE.INDEX', kind: CompletionItemKind.Function, data: 46 },
			{ label: 'CREATE.FILE', kind: CompletionItemKind.Function, data: 47 },
			{ label: 'TYPE', kind: CompletionItemKind.Function, data: 48 },
			{ label: 'FORM.LIST', kind: CompletionItemKind.Function, data: 49 },
			{ label: 'PROFILE', kind: CompletionItemKind.Function, data: 50 },
			{ label: 'STATS', kind: CompletionItemKind.Function, data: 50 },
			{ label: 'AUTOLOGOUT', kind: CompletionItemKind.Function, data: 51 },
			{ label: 'CLEARSELECT', kind: CompletionItemKind.Function, data: 52 },
			{ label: 'CACHE', kind: CompletionItemKind.Function, data: 53 },
			{ label: 'LIST.CACHE', kind: CompletionItemKind.Function, data: 54 },
			{ label: 'CLEAR.CACHE', kind: CompletionItemKind.Function, data: 55 },
			{ label: 'CLEARDATA', kind: CompletionItemKind.Function, data: 56 },
			{ label: 'COMO', kind: CompletionItemKind.Function, data: 57 },
			{ label: 'CONVERT.UTF8', kind: CompletionItemKind.Function, data: 58 },
			{ label: 'DATE.FORMAT', kind: CompletionItemKind.Function, data: 59 },
			{ label: 'DELETE', kind: CompletionItemKind.Function, data: 60 },
			{ label: 'DIVERT.OUT', kind: CompletionItemKind.Function, data: 61 },
			{ label: 'ECHO.ON', kind: CompletionItemKind.Function, data: 62 },
			{ label: 'ECHO.OFF', kind: CompletionItemKind.Function, data: 62 },
			{ label: 'P', kind: CompletionItemKind.Function, data: 62 },
			{ label: 'ECLTYPE', kind: CompletionItemKind.Function, data: 63 },
			{ label: 'ESEARCH', kind: CompletionItemKind.Function, data: 64 },
			{ label: 'SEARCH', kind: CompletionItemKind.Function, data: 64 },
			{ label: 'LOGOFF', kind: CompletionItemKind.Function, data: 65 },
			{ label: 'LOGTO', kind: CompletionItemKind.Function, data: 66 },
			{ label: 'MERGE.LIST', kind: CompletionItemKind.Function, data: 67 },
			{ label: 'PHANTOM', kind: CompletionItemKind.Function, data: 68 },
			{ label: 'RESET', kind: CompletionItemKind.Function, data: 69 },
			{ label: 'SET.DEBUGGER', kind: CompletionItemKind.Function, data: 70 },
			{ label: 'SET.FILE', kind: CompletionItemKind.Function, data: 71 },
			{ label: 'SETPTR', kind: CompletionItemKind.Function, data: 72 },
			{ label: 'SHOW.CONFIG', kind: CompletionItemKind.Function, data: 73 },
			{ label: 'SHOW.LICENSE', kind: CompletionItemKind.Function, data: 74 },
			{ label: 'SP.STATUS', kind: CompletionItemKind.Function, data: 75 },
			{ label: 'TERM', kind: CompletionItemKind.Function, data: 76 },
			{ label: 'UPDATE.SQLSERVER', kind: CompletionItemKind.Function, data: 77 },
			{ label: 'DEPLOY.SQLSERVER', kind: CompletionItemKind.Function, data: 77 },
			{ label: 'UPDATE.VOC', kind: CompletionItemKind.Function, data: 78 },
			{ label: 'VERSION', kind: CompletionItemKind.Function, data: 79 },
			{ label: 'WHERE', kind: CompletionItemKind.Function, data: 80 },
			{ label: 'WHO', kind: CompletionItemKind.Function, data: 81 },
			{ label: 'ADD.ACCOUNT', kind: CompletionItemKind.Function, data: 82 },
			{ label: 'DROP.ACCOUNT', kind: CompletionItemKind.Function, data: 83 },
			{ label: 'CREATE.ACCOUNT', kind: CompletionItemKind.Function, data: 84 },
			{ label: 'DELETE.FILE', kind: CompletionItemKind.Function, data: 85 },
			{ label: 'LIST.INDEX', kind: CompletionItemKind.Function, data: 86 },
			{ label: 'LIST.ACCOUNTS', kind: CompletionItemKind.Function, data: 87 },
			{ label: 'LINKED.ACCOUNTS', kind: CompletionItemKind.Function, data: 88 },
			{ label: 'CREATE.VIEW', kind: CompletionItemKind.Function, data: 89 },
			{ label: 'DELETE.VIEW', kind: CompletionItemKind.Function, data: 90 },
			{ label: 'NSELECT', kind: CompletionItemKind.Function, data: 91 },
			{ label: 'SUM', kind: CompletionItemKind.Function, data: 92 },
			{ label: 'CREATE.MVVIEW', kind: CompletionItemKind.Function, data: 93 },


		];

		return result;
	}
);

// This handler resolve additional information for the item selected in
// the completion list.
connection.onCompletionResolve(
	(item: CompletionItem): CompletionItem => {
		switch (item.data) {
			case 1:
				item.detail = 'SELECT {Filename} {Criteria}';
				item.documentation = 'Select records from a file with the criteria specfied. The list of ids will be stored in the active select list (0).';
				break;
			case 2:
				item.detail = 'WITH {Fieldname} operator {Value}\r\nWITH {Fieldname} operator {Fieldname}';
				item.documentation = 'Test a field against a value or another field';
				break;
			case 3:
				item.detail = 'FROM {Filename}';
				item.documentation = 'Used in the COPY statement to specify the file where record are read from';
				break;
			case 4:
				item.detail = 'TO {Filename}\r\nTO {0-9} ';
				item.documentation = 'Used in the COPY statement to specify the file where record are copied to\r\nUsed in {S}SELECT statement to store the list of ids to the specified list number';
				break;
			case 5:
				item.detail = 'COPY FROM {Filename} TO {Filename} [ALL,OVERWRITING,DELETING]\r\nCOPY {Filename}';
				item.documentation = 'COPY Records from one file to another. IF a select list is active, only the records in the select list are copied';
				break;
			case 6:
				item.detail = 'SSELECT {Filename} {Criteria}';
				item.documentation = 'Select records from a file with the criteria specfied. The returned record ids are sorted. The list of ids will be stored in the active select list (0).';
				break;
			case 7:
				item.detail = 'SORT {Filename} {Criteria} {Fieldnames}';
				item.documentation = 'Sort the File and apply the Criteria. Sort criteria are specified using the BY and BY-DSND keywords. The Fieldnames listed are displayed to the screen or printer';
				break;
			case 8:
				item.detail = 'LIST {Filename} {Criteria} {Fieldnames}';
				item.documentation = 'List the File and apply the Criteria. Sort criteria are specified using the BY and BY-DSND keywords. The Fieldnames listed are displayed to the screen or printer';
				break;
			case 9:
				item.detail = 'COUNT {Filename} {Criteria}';
				item.documentation = 'Returns the number of records that meet the criteria specified';
				break;
			case 10:
				item.detail = 'SAVE.LIST {Listname}\r\nSAVE-LIST {Listname}';
				item.documentation = 'Saves the active select list to the Listname spacified. If no Listname is spcefied, it defaults to &TEMP{PortNumber}&';
				break
			case 11:
				item.detail = 'COUNT {Filename} {Criteria}';
				item.documentation = 'Counts the number of record in the file that meets the selection criteria. If no criteria is specified , a count of all records in the file is returned.';
				break;
			case 12:
				item.detail = 'TOTAL {Fieldname}';
				item.documentation = 'Totals the specified field and displays the total on each break line and at the end of the report';
				break;
			case 13:
				item.detail = 'BY {Fieldname}\r\nBY.DSND {Fieldname}\r\nBY-DSND {Fieldname}';
				item.documentation = 'Sorts the file by the field specified. Multiple sort criteria can be specified in a select or report';
				break;
			case 14:
				item.detail = 'BY.EXP {Fieldname}\r\nBY-EXP {Fieldname}\r\nBY.EXP.DSND {Fieldname}\r\nBY-EXP-DSND {Fieldname}';
				item.documentation = 'Sorts the file by exploding each multivalue in the field specified.';
				break;
			case 15:
				item.detail = 'BASIC {Filename} {Programname} ( {options}\r\COMPILE {Filename} {Programname} ( {options}';
				item.documentation = 'Compiles the specified program in the file. Options are\r\nD - Generate debug symbols\r\nG - Generate C# source code\r\nL - Generate C# source in local file';
				break;
			case 16:
				item.detail = 'DEBUG {Filename} {Programname}';
				item.documentation = 'Runs the specified program and lauches the debugger, the program must have been compiled with the (D option.';
				break;
			case 17:
				item.detail = 'RUN {Filename} {Programname}';
				item.documentation = 'Runs the specified program.';
				break;
			case 18:
				item.detail = 'CATALOG {Filename} {Programname} [AS {Newname}]\r\nCATALOG {Filename} {Programname} FUNCTION {Functionname}';
				item.documentation = 'Creates a VOC entry for the program. If the AS statement is included, the VOC entry will be Newname. The second syntax is used for Javascript and Python functions';
				break;
			case 19:
				item.detail = 'LISTF\r\nLISTFILES';
				item.documentation = 'Displays a list of all files in your current account';
				break;
			case 20:
				item.detail = 'MESSAGE {*} {user name} {user number} {message text}';
				item.documentation = 'Send a message to console of a specific user port number or all';
				break;
			case 21:
				item.detail = 'PORT.STATUS {PORT pid} {STACK} {FILES} {VAR} {BREAK} {DEBUG} {PROFILE ON/OFF/CLEAR/IMPORT}';
				item.documentation = 'Analyse currently running processes. See Application Performance Profiling documentation';
				break;
			case 22:
				item.detail = 'BREAK.ON {Fieldname}\r\nBREAK-ON {Fieldname}';
				item.documentation = 'Forces a break to occur when the values of Fieldname changes. This is normally accompanied with the BY clause.';
				break;
			case 23:
				item.detail = 'LISTU';
				item.documentation = 'Displays details of all users that are currently logged into the system.';
				break;
			case 24:
				item.detail = 'SEARCH {Filename} {RecordIds}';
				item.documentation = 'Searches through all the records in a file that contain a specific word or phrase. You are prompted for the search string.';
				break;
			case 25:
				item.detail = 'OFF\r\nQUIT\r\nBYE\r\nLO\r\nLOGOUT';
				item.documentation = 'Terminates your current session.';
				break;
			case 26:
				item.detail = 'LISTPTR';
				item.documentation = 'Displays a list of all printers configured on your system.';
				break;
			case 27:
				item.detail = 'LIST.ITEM {Filename} {Recordid}\r\nLIST-ITEM {Filename} {Recordid}\r\nCT {Filename} {Recordid}';
				item.documentation = 'Displays the contents of the record in a file to the terminal';
				break;
			case 28:
				item.detail = 'LOCK {Locknumber}';
				item.documentation = 'Sets a system lock on any of the 64 system locks. (0 - 63). If the lock is already set by another user. Your process waits until the lock is released.';
				break;
			case 29:
				item.detail = 'CLEAR.LOCKS {Locknumber}\r\nCLEAR-LOCKS {Locknumber}';
				item.documentation = 'Removes the system lock specified by locknumber. If locknumber is omitted, all locks are removed.';
				break;
			case 30:
				item.detail = 'LIST.LOCKS\r\nLIST-LOCKS';
				item.documentation = 'Diplays the system lock table. The process id is shown if a user has set a lock.';
				break;
			case 31:
				item.detail = 'CLEARCOMMON';
				item.documentation = 'Clears all variables set in common and named common.';
				break;
			case 32:
				item.detail = 'AND';
				item.documentation = 'Applies the AND operator to your criteria in.';
				break;
			case 33:
				item.detail = 'OR';
				item.documentation = 'Applies the OR operator to your criteria.';
				break;
			case 34:
				item.detail = 'LIST.READU\r\nLIST-READU';
				item.documentation = 'Display all file and record locks on the system';
				break;
			case 35:
				item.detail = 'UNLOCK {ALL} {USER user name} {PID process id} {FILE filename}';
				item.documentation = 'Removes the specified lock from the system.';
				break;
			case 36:
				item.detail = 'COMPILE.DICT {Filename} {Recordid}\r\nCOMPILE-DICT {Filename} {Recordid}\r\nCD {Filename} {Recordid}';
				item.documentation = 'Compiles the specified dictionary. If Recordid is ommited, all Itypes in the dictionary are compiled.';
				break;
			case 37:
				item.detail = 'CLR\r\nCS';
				item.documentation = 'Clears the terminal screen.';
				break;
			case 38:
				item.detail = 'DISPLAY {Text}';
				item.documentation = 'Displays the text specified to the terminal.';
				break;
			case 39:
				item.detail = 'SLEEP {Seconds}\r\nSLEEP {hh:mm:ss}';
				item.documentation = 'Sleeps your process for a number of seconds or until a specific time';
				break;
			case 40:
				item.detail = 'DATE';
				item.documentation = 'Displays the Date to the terminal.';
				break;
			case 41:
				item.detail = 'TIME';
				item.documentation = 'Displays the Time to the terminal.';
				break;
			case 42:
				item.detail = 'GET.LIST {Listname} [TO Listnumber]\r\nGET-LIST {Listname} [TO Listnumber]';
				item.documentation = 'Get the Listname from the &SAVEDLISTS& and makes it the active select list. If the optional TO statement is used the list is activated on the list number.';
				break;
			case 43:
				item.detail = 'EDIT.LIST {Listname}\r\nEDIT-LIST {Listname}';
				item.documentation = 'Edits the listname in the editor.';
				break;
			case 44:
				item.detail = 'DELETE.LIST {Listname}\r\nDELETE-LIST {Listname}';
				item.documentation = 'Deletes the listname from the &SAVEDLISTS& file.';
				break;
			case 45:
				item.detail = 'CREATE.INDEX {Filename} {Dictionaryname}\r\nCREATE-INDEX {Filename} {Dictionaryname}';
				item.documentation = 'Creates an index on the specified filename using the dictionary name. Indexing is only supported on SQL and MongoDB files';
				break;
			case 46:
				item.detail = 'DELETE.INDEX {Filename} {Dictionaryname} [ALL]\r\nDELETE-INDEX {Filename} {Dictionaryname} [ALL]';
				item.documentation = 'Deletes the index on the filename using the dictionaryname. To delete all indexes on a file, omit the dictionaryname and specify ALL';
				break;
			case 47:
				item.detail = 'CREATE.FILE {Filename}\r\nCREATE-FILE {Filename}\r\nCREATE.FILE {Filename} TYPE={Filetype}\r\nCREATE.FILE {Filename} Type={Filetype} ON {Database}\r\nCREATE-FILE {Filename} TYPE={Filetype}\r\nCREATE-FILE {Filename} Type={Filetype} ON {Database}';
				item.documentation = 'The first format will create a SQL Server file. In the second format Filetype can be SqlArray, Hashed or Directory. In the third format Filetype can be MongoDB,Universe,Unidata and Database must be specified.';
				break;
			case 48:
				item.detail = 'TYPE={Filetype}';
				item.documentation = 'Used with the CREATE.FILE statement to specify the file type to be created. Filetype can be SqlArray, Hashed, Directory, MongoDB, Universe, Unidata.';
				break;
			case 49:
				item.detail = 'FORM.LIST {Filename} {Itemname}\r\nFORM-LIST {Filename} {Itemname}\r\nQSELECT {Filename} {Itemname}';
				item.documentation = 'Creates an active select list by read the itemname from the filename and uses each attribute as a key';
				break;

			case 50:
				item.detail = 'PROFILE {ON} {OFF} {CLEAR} {DISPLAY [FILEIO] [SUBROUTINES] [EXECUTES] [ITYPES] [ITYPEDETAIL]}\r\nSTATS {ON} {OFF} {CLEAR} {DISPLAY [FILEIO] [SUBROUTINES] [EXECUTES] [ITYPES] [ITYPEDETAIL]}';
				item.documentation = 'Display profiling information of a process';
				break;
			case 51:
				item.detail = 'AUTOLOGOUT n';
				item.documentation = 'Sets the number of seconds before a process automatically logs out if there is no keyboard input';
				break;
			case 52:
				item.detail = 'CLEARSELECT [{listnumber} {ALL}]';
				item.documentation = 'Clears the active select list (listnumber 0), or an optional list number (0-9). If the ALL option is selected then all lists are cleared. CLEARSELECT with no listnumber clears all active lists';
				break;
			case 53:
				item.detail = 'CACHE {Tablename}';
				item.documentation = 'Allows a process to cache a file in memory. Tablename is the name of the database table, located in the VOC file definition entry. Field 2 is the data file tablename, field 3 is the dictionary table name. CACHE is useful when running reports with lots of translates as it reduces i/o';
				break;
			case 54:
				item.detail = 'LIST.CACHE\r\nLIST-CACHE';
				item.documentation = 'Provides statistics on the tables currently cached';
				break;
			case 55:
				item.detail = 'CLEAR.CACHE\r\nCLEAR-CACHE';
				item.documentation = 'Clears all currently cached files';
				break;
			case 56:
				item.detail = 'CLEARDATA';
				item.documentation = 'Clears the data stack built by DATA statements in either paragraphs or BASIC programs';
				break;
			case 57:
				item.detail = 'COMO {ON} {OFF} {Recordid}';
				item.documentation = 'Starts or stops copying of terminal output to a record in the file &COMO&';
				break;
			case 58:
				item.detail = 'CONVERT.UTF8 {Filename}';
				item.documentation = 'Converts records in a directory file to UTF8, if a select list is not active all the records in the file will be converted.';
				break;
			case 59:
				item.detail = 'DATE.FORMAT {ON} {OFF}\r\nDATE-FORMAT {ON} {OFF}';
				item.documentation = 'Sets international date format if ON is specified, sets US date format if OFF is specified.';
				break;
			case 60:
				item.detail = 'DELETE [DICT] {Filename} [Recordid] [ALL]';
				item.documentation = 'Deletes records from a file. If a select list is active, then Recordids in the list are used. ';
				break;
			case 61:
				item.detail = 'DIVERT.OUT {ON} {OFF} {FILE.ON} {FILE.OFF} {TTY.ON} {TTY.OFF} {Filename Itemname} [APPEND] [TRUNCATE]\r\nDIVERT-OUT {ON} {OFF} {FILE.ON} {FILE.OFF} {TTY.ON} {TTY.OFF} {Filename Itemname} [APPEND] [TRUNCATE]';
				item.documentation = 'Diverts terminal output to a record in a directory file';
				break;
			case 62:
				item.detail = 'ECHO.ON\r\nECHO.OFF\r\nECHO-ON\r\nECHO-OFF\r\nP';
				item.documentation = 'Turns echo of TCL on or off.P toggles the current setting';
				break;
			case 63:
				item.detail = 'ECLTYPE {P} {U}';
				item.documentation = 'Displays the current setting of TCL flavor or sets the flavor to (P)ICK or (U)2.';
				break;
			case 64:
				item.detail = 'SEARCH [DICT] {Filename}\r\nESEARCH [DICT] {Filename}';
				item.documentation = 'Prompts for string(s). Searches the file for the string(s). If there is an active select list these Recordids will be used, otherwise the whole file is searched.';
				break;
			case 65:
				item.detail = 'LOGOFF {Pid}';
				item.documentation = 'Logs off the process specified by Pid. If no Pid is specified then the current process logs out.';
				break;
			case 66:
				item.detail = 'LOGTO {Accountname}';
				item.documentation = 'Logs to the specified account';
				break;
			case 67:
				item.detail = 'MERGE.LIST {Listnumber 1} {[UNION] [INTERSECT[ION]] [DIFF]} {Listnumber 2} [TO {Listnumber 3}] [COUNT.SUP]\r\nMERGE-LIST {Listnumber 1} {[UNION] [INTERSECT[ION]] [DIFF]} {Listnumber 2} [TO {Listnumber 3} [COUNT.SUP]';
				item.documentation = 'Merges two numbered select lists using relational set operations, optionally creating a third numbered list.';
				break;
			case 68:
				item.detail = 'PHANTOM [BRIEF] [SQUAWK] {command}';
				item.documentation = 'Starts a background process to run a command. The command can not require input. The output is written to the &PH& file, unless BRIEF is specified';
				break;
			case 69:
				item.detail = 'RESET';
				item.documentation = 'Resets session values';
				break;
			case 70:
				item.detail = 'SET.DEBUGGER\r\n';
				item.documentation = '';
				break;
			case 71:
				item.detail = 'SET.FILE {Accountname} {Filename} [q-pointer]\r\nSET-FILE {Accountname} {Filename} [q-pointer]';
				item.documentation = 'Creates a Q-Pointer to a file in an account, with an optional q-pointer filename. The account must be linked. If q-pointer is not specified then a pointer with the name QFILE is created';
				break;
			case 72:
				item.detail = 'SETPTR [unit number, page width, page depth, top margin, bottom margin, mode, options';
				item.documentation = 'Sets printer options for a logical print channel to output either to a printer or a hold file. SETPTR with no parmeters displays the settings of print chanel 0. Output to a printer is in RAW mode.';
				break;
			case 73:
				item.detail = 'SHOW.CONFIG\r\nSHOW-CONFIG';
				item.documentation = 'Displays configuration information';
				break;
			case 74:
				item.detail = 'SHOW.LICENSE\r\nSHOW-LICENSE';
				item.documentation = 'Displays license information';
				break;
			case 75:
				item.detail = 'SP.STATUS\r\nSP-STATUS';
				item.documentation = 'Displays Windows spooler information';
				break;
			case 76:
				item.detail = 'TERM [width, depth, skip, LF delay, FF delay, Backspace, Term Type]';
				item.documentation = 'Sets or displays terminal characteristics. Term Type can be console, ansi, wyse50 or vt220';
				break;
			case 77:
				item.detail = 'UPDATE.SQLSERVER\r\nUPDATE-SQLSERVER\r\nDEPLOY.SQLSERVER\r\nDEPLOY.SQLSERVER';
				item.documentation = 'Installs MVON# SQL Server extensions into a SQL Server database';
				break;
			case 78:
				item.detail = 'UPDATE.VOC\r\nUPDATE-VOC';
				item.documentation = 'Updates the VOC with the latest MVON# definitions';
				break;
			case 79:
				item.detail = 'VERSION';
				item.documentation = 'Displays the current version of MVON#';
				break;
			case 80:
				item.detail = 'WHERE';
				item.documentation = 'Displays the location of the current account';
				break;
			case 81:
				item.detail = 'WHO';
				item.documentation = 'Displays the current pid, account and Windows user';
				break;

				case 82:
				item.detail = 'ADD.ACCOUNT {Accountname}\r\nADD-ACCOUNT {Accountname}';
				item.documentation = 'Creates a database link to a UniVerse or UniData account in the Account.Xml file.\r\nThe following information is prompted for:\r\nAccount Type   		:\r\nAccount Name        	:\r\nHost/IpAddress      	:\r\nUser Id             		:\r\nPassword            	:\r\nUpdate Account.xml  	:';
				break;
			case 83:
				item.detail = 'DROP.ACCOUNT {Accountname}\r\nDROP-ACCOUNT {Accountname}';
				item.documentation = 'Removes an account from Account.Xml file';
				break;
			case 84:
				item.detail = 'CREATE.ACCOUNT {Accountname}\r\nCREATE-ACCOUNT {Accountname}';
				item.documentation = 'Creates a new account consisting of a SQL Server database containing the VOC, ERRMSG and DICT.DICT files and their associated dictionaries.\r\nA directory containing the Account.xml setup and all Directory files including system directory files like &HOLD&, &PH& and &SAVEDLISTS& is also created. The following information is prompted for:\r\nAccount Name        :\r\nSql Server Instance :\r\nUser Id             :sa\r\nPassword            :\r\nNetbasic Path (C:\Netbasic Accounts):';
				break;
			case 85:
				item.detail = 'DELETE.FILE [DICT|DATA] {Filename[,Filname1]}\r\DELETE-FILE [DICT|DATA] {Filename}';
				item.documentation = 'If no DATA or DICT qualifer is specified, then the dictionary and all data files are deleted, and the file definition item in the VOC file is removed.';
				break;
			case 86:
				item.detail = 'LIST.INDEX {Filename}\r\nLIST-INDEX {Filename}';
				item.documentation = 'Displays the indexes created on a file to the terminal';
				break;
			case 87:
				item.detail = 'LIST.ACCOUNTS\r\nLIST-ACCOUNTS';
				item.documentation = 'Displays the accounts available on the system';
				break;
			case 88:
				item.detail = 'LINKED.ACCOUNTS\r\nLINKED-ACCOUNTS';
				item.documentation = 'Displays all the accounts that are linked to the current account';
				break;
			case 89:
				item.detail = 'CREATE.VIEW {Filename} {Viewname}\r\nCREATE-VIEW {Filename} {Viewname}';
				item.documentation = 'Creates a view on a SQL Server table referenced by Filename. Viewname is a phrase record in the dictionary of Filename with a list of single valued attributes contained in the view, I-Types can not call subroutines. An update trigger is also created on the view. ';
				break;
			case 90:
				item.detail = 'DELETE.VIEW {Filename} {Viewname}\r\nDELETE-VIEW {Filename} {Viewname}';
				item.documentation = 'Deletes view, Viewname, on a SQL Server table referenced by Filename. ';
				break;
			case 91:
				item.detail = 'NSELECT [DICT] {Filename} [FROM Listnumber1] [TO Listnumber2]';
				item.documentation = 'Creates a subset of data from an active select list. NSELECT selects elements from the active select that are not in the specified file. The optional Listnumber1 and Listnumber2 can have a value of 0-9.';
				break;
			case 92:
				item.detail = 'SUM {Filename} {Fieldnames}';
				item.documentation = 'Adds numeric attributes within a file. SUM produces a total for the attibutes added, and a count of the number of records processed.';
				break;
			case 93:
				item.detail = 'CREATE.MVVIEW {Filename} {Viewname}\r\nCREATE-VIEW {Filename} {Viewname}';
				item.documentation = 'Creates a view on a SQL Server table referenced by Filename. Viewname is a phrase record in the dictionary of Filename with a list of single and multi-valued attributes contained in the view, I-Types can not call subroutines. The view created displays each multivalued field as a row in the view. An update trigger is also created on the view. ';
		

		}

		return item;
	}
);


connection.onDidOpenTextDocument((params) => {
	// A text document got opened in VSCode.
	// params.uri uniquely identifies the document. For documents store on disk this is a file URI.
	// params.text the initial full content of the document.
	connection.console.log(`${params.textDocument.uri} opened.`);
});
connection.onDidChangeTextDocument((params) => {
	// The content of a text document did change in VSCode.
	// params.uri uniquely identifies the document.
	// params.contentChanges describe the content changes to the document.

	connection.console.log(`${params.textDocument.uri} changed: ${JSON.stringify(params.contentChanges)}`);
});
connection.onDidCloseTextDocument((params) => {
	// A text document got closed in VSCode.
	// params.uri uniquely identifies the document.
	connection.console.log(`${params.textDocument.uri} closed.`);
});


// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();
