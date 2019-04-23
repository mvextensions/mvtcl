/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as path from 'path';
import { workspace, ExtensionContext } from 'vscode';
import * as vscode from 'vscode';

import {
	LanguageClient,
	LanguageClientOptions,
	ServerOptions,
	TransportKind,
	HoverRequest
} from 'vscode-languageclient';
import { stat } from 'fs';
import MvonGateway = require("./MvonGateway")
import NetObjects = require("./NetObjects")

let client: LanguageClient;
var terminal: vscode.Terminal;
let FileNames = "";
var MvonSession: any;
var UsingGateway: boolean;

export function activate(context: ExtensionContext) {
	// The server is implemented in node
	let serverModule = context.asAbsolutePath(
		path.join('server', 'out', 'server.js')
	);
	// The debug options for the server
	// --inspect=6009: runs the server in Node's Inspector mode so VS Code can attach to the server for debugging
	let debugOptions = { execArgv: ['--nolazy', '--inspect=6010'] };

	// If the extension is launched in debug mode then the debug server options are used
	// Otherwise the run options are used
	let serverOptions: ServerOptions = {
		run: { module: serverModule, transport: TransportKind.ipc },
		debug: {
			module: serverModule,
			transport: TransportKind.ipc,
			options: debugOptions
		}
	};

	let SshCommand: string = vscode.workspace.getConfiguration("tcl").get("sshCommand");
	let TclParamters: string[] = vscode.workspace.getConfiguration("tcl").get("parameters");

	// Options to control the language client
	let clientOptions: LanguageClientOptions = {
		// Register the server for plain text documents
		documentSelector: [{ scheme: 'file', language: 'tcl' }, { scheme: 'MvonFS', language: 'tcl' }, { scheme: 'GatewayFS', language: 'tcl' }],
		synchronize: {
			// Notify the server about file changes to '.clientrc files contained in the workspace
			fileEvents: workspace.createFileSystemWatcher('**/.clientrc')
		}
	};

	let RemoteHost: string = vscode.workspace.getConfiguration("mvon").get("remoteHost");
	let UserName: string = vscode.workspace.getConfiguration("mvon").get("UserName");
	let Password: string = vscode.workspace.getConfiguration("mvon").get("Password");
	let Account: string = vscode.workspace.getConfiguration("mvon").get("Account")
	let AccountPassword: string = vscode.workspace.getConfiguration("mvon").get("AccountPassword")
	let GatewayHost: string = vscode.workspace.getConfiguration("mvon").get("gatewayHost");
	let useGateway: boolean = vscode.workspace.getConfiguration("mvon").get("useGateway");
	let GatewayPort: number = vscode.workspace.getConfiguration("mvon").get("gatewayPort");
	let GatewayType: string = vscode.workspace.getConfiguration("mvon").get("gatewayType");
	let HomePath: string = vscode.workspace.getConfiguration("mvon").get("homePath");
	let codePage: string = vscode.workspace.getConfiguration("mvon").get("encoding");;
	let formattingEnabled: boolean = vscode.workspace.getConfiguration("mvon").get("formattingEnabled");
	let additionalFiles: any = vscode.workspace.getConfiguration("mvon").get("additionalFiles");
	let gatewayDebug: any = vscode.workspace.getConfiguration("mvon").get("gatewayDebug");



	// Create the language client and start the client.
	client = new LanguageClient(
		'MVON# TCL',
		'MVON# TCL Language',
		serverOptions,
		clientOptions
	);



	let connectMV = vscode.commands.registerCommand('extension.connectMV', async () => {
		// Check we have credentials and server details
		if (terminal == null) {
			terminal = vscode.window.createTerminal("TCL")
		}
		terminal.show();
		terminal.sendText(SshCommand, true)
		if (RemoteHost === "") {
			vscode.window.showInformationMessage('Please configure RemoteHost,UserName,Password and Account in Preferences!');
			return;
		}

		if (useGateway === true) {
			if (MvonSession === undefined) {
				vscode.window.showInformationMessage("Connecting to MVON# Gateway");
				let gateway = new MvonGateway.GatewayController(GatewayHost, GatewayPort);
				gateway.codePage = "iso8859-1"
				if (codePage != undefined) {
					gateway.codePage = codePage;
				}
				await gateway.OpenConnection(GatewayType, RemoteHost, UserName, Password, Account, AccountPassword, HomePath, gatewayDebug)
				if (gateway.HostConnected === false) {
					vscode.window.showErrorMessage('Error connecting to the Gateway on ' + GatewayHost);
					return;
				}
				if (gateway.Connected === false) {
					vscode.window.showErrorMessage('Error connecting to the Server on ' + RemoteHost);
					return;
				}
				MvonSession = gateway;
			}
			await MvonSession.GetAllFileList();
			let fileList = MvonSession.Response.split(String.fromCharCode(1));
			client.sendRequest("FileList", fileList.join('|'));
			vscode.window.showInformationMessage("File List Updated");

		} else {
			// Display a message box to the user		
			if (MvonSession === undefined) {
				vscode.window.showInformationMessage("Connecting to MVON# Server - " + RemoteHost);
				let session = new NetObjects.NetSession(RemoteHost, UserName, Password, Account);
				await session.Open();
				MvonSession = session;
			}
			let cmd = MvonSession.CreateCommand();
			cmd.Command = "SELECT VOC WITH F1 LIKE F...";
			await cmd.Execute();
			let sel = MvonSession.CreateSelectList(0);
			while (true) {
				await sel.Next();
				let id = sel.Response;
				if (!id.endsWith(".Lib") && id != "") {
					FileNames += "|" + id;
				}
				if (sel.LastRecordRead === true) {
					break;
				}


			}
			client.sendRequest("FileList", FileNames.substr(1));
			vscode.window.showInformationMessage("File List Updated");
		}

	});
	let sendParameters = vscode.commands.registerCommand('extension.sendParameters', async () => {
		// Check we have credentials and server details
		if (terminal == null) {
			terminal = vscode.window.createTerminal("TCL")
		}
		terminal.show();
		for (var i = 0; i < TclParamters.length; i++) {
			terminal.sendText(TclParamters[i], true)
		}
	});
	let executeTcl = vscode.commands.registerCommand('extension.executeTcl', async () => {
		const editor = vscode.window.activeTextEditor;
		let textToPaste;
		if (editor.selection.isEmpty === true) {
			textToPaste = editor.document.lineAt(editor.selection.active.line).text;
		} else {
			textToPaste = editor.document.getText(editor.selection);
		}
		let lines = textToPaste.split('\r');
		for (var i = 0; i < lines.length; i++) {
			terminal.sendText(lines[i], true)
		}

	});
	context.subscriptions.push(executeTcl);
	context.subscriptions.push(sendParameters);
	context.subscriptions.push(connectMV);

	// Start the client. This will also launch the server

	let status = "";
	client.onReady().then(async () => {

		client.onRequest("GetDictList", async (params) => {
			// server requires the dictionaries for a specific file.
			if (useGateway === true) {
				let fileNames = params.substr(1).split("|");
				for (var i = 0; i < fileNames.length; i++) {
					let currentFile = fileNames[i];
					await MvonSession.OpenDictionary(currentFile);
					await MvonSession.GetDictList();
					let dictList = MvonSession.Response.split(String.fromCharCode(1));
					let x = dictList.length;
					let dictDetails = "";
					for (var i = 0;i<dictList.length;i++)
					{
						// remove SB+ dicts
						if (dictList[i].startsWith(".") === true) { continue;}
						await MvonSession.ReadDictionary(dictList[i]);
						let dictRec = MvonSession.Response;
						if (dictRec.startsWith("SCREEN") || dictRec.startsWith("REPORT")) { 
							continue;
						}
						if (dictRec.substr(0,1) != ".")
						{
							dictRec = dictRec.split(String.fromCharCode(2)).join(String.fromCharCode(254));							
							dictDetails += String.fromCharCode(1) + dictList[i] + String.fromCharCode(254) +dictRec;
						}

					}
					client.sendRequest("SetDictionary", currentFile + String.fromCharCode(2) + dictDetails.substr(1));
					vscode.window.showInformationMessage("Dictionary For " + currentFile + " Loaded");
				}

			} else {
				let z = params;
				let cmd = MvonSession.CreateCommand();
				let fileNames = params.substr(1).split("|");
				for (var i = 0; i < fileNames.length; i++) {
					cmd.Command = "SELECT DICT " + fileNames[i] + " WITH F1 LIKE D... I... A... S...";
					await cmd.Execute();
					let dictList = "";
					let sel = MvonSession.CreateSelectList(0);
					let dictFile = MvonSession.CreateNetFile(fileNames[i]);
					await dictFile.OpenDictionary();

					while (true) {
						await sel.Next();
						let id = sel.Response;
						dictFile.RecordId = id;
						if (id === "") { break; }
						await dictFile.Read()
						// remove SB+ definitions 
						if (dictFile.Record.StringValue().startsWith("SCREEN") || dictFile.Record.StringValue().startsWith("REPORT")) { continue;}
						if (!id.endsWith(".Lib") && id != "") {
							dictList += String.fromCharCode(1) + id + String.fromCharCode(254) + dictFile.Record.StringValue();
						}
						if (sel.LastRecordRead === true) {
							break;
						}
					}
					client.sendRequest("SetDictionary", fileNames[i] + String.fromCharCode(2) + dictList.substr(1));
					vscode.window.showInformationMessage("Dictionary For " + fileNames[i] + " Loaded");
				}
			}

		});
		client.onRequest("GetItemList", async (params) => {
			// server requires the dictionaries for a specific file.
			if (useGateway === true) {
				let fileNames = params.substr(1).split("|");
				for (var i = 0; i < fileNames.length; i++) {
					let currentFile = fileNames[i];
					await MvonSession.OpenFile(currentFile);
					await MvonSession.GetRecordList();
					let itemArray  = MvonSession.Response.split(String.fromCharCode(1));
					client.sendRequest("SetFileItems", currentFile + String.fromCharCode(2) + itemArray.join(String.fromCharCode(1)));
					vscode.window.showInformationMessage("Item List  For " + currentFile + " Loaded");
				}
			} 
			else
			{
				let fileNames = params.substr(1).split("|");
				let cmd = MvonSession.CreateCommand();
				for (var i = 0; i < fileNames.length; i++) {
					let currentFile = fileNames[i];
					cmd.Command = "SELECT " +currentFile;
					await cmd.Execute();
					let itemList = "";
					let sel = MvonSession.CreateSelectList(0);					
					while (true) {
						await sel.Next();
						let id = sel.Response;
						if (id === "") { break; }
						itemList += "|"+id;					
						if (sel.LastRecordRead === true) {
							break;
						}
					}
					let itemArray = itemList.substring(1).split('|');
					client.sendRequest("SetFileItems", currentFile + String.fromCharCode(2) + itemArray.join(String.fromCharCode(1)));
					vscode.window.showInformationMessage("Item List  For " + currentFile + " Loaded");
				}
			}

		});

		client.onRequest("Hello", (params) => {
			let z = params;
		})

	});
	context.subscriptions.push(client.start());
}



export function deactivate(): Thenable<void> {
	if (!client) {
		return undefined;
	}
	return client.stop();
}
