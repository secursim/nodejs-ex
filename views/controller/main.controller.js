/* global io:true */
/* eslint-disable */
sap.ui.define([
	"sap/m/MessagePopover",
	"sap/m/MessageItem",
	"sap/m/MessageToast",
	"sap/m/Link",
	"sap/m/MessageBox",
	"jquery.sap.global",
	"sap/ui/core/Fragment",
	"sap/ui/core/mvc/Controller",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/ui/model/json/JSONModel",
	"sap/base/Log",
	"it/greenorange/mes/libs/socket",
	"sap/m/Token"

], function (MessagePopover, MessageItem, MessageToast, Link, MessageBox, jQuery, Fragment, Controller, Filter, FilterOperator, JSONModel,
	Log, socket, Token) {
	"use strict";
	var itemSelected = "";
	var ipMacchinarioSelected = "";
	var sensorIdSelected = "";
	var itemRipSelected = "";
	var operationSelected = "";
	var getUrl = "";
	var oVersion = "1.0";
	var columnsTable;
	var oLink = new Link({
		text: "Show more information",
		target: "_blank"
	});
	var oMessageTemplate = new MessageItem({
		type: "Information",
		title: "Utente {cid} {cognome} {nome}",
		activeTitle: false
	});
	// definisco il socket al quale puntare
	var urlSocket = "cbu01esmasthokbma-nodejsserverdev.cfapps.eu10.hana.ondemand.com/";
	var port = 63460;
	var hostnamePath = location.hostname;
	if (hostnamePath.indexOf("ijkyq6bcfi") > 0) {
		// entro qui dentro se sono in produzione
		urlSocket = "lPW2plBdd8Y4Qj93rMTA-NodeJsServer.cfapps.eu10.hana.ondemand.com/";
		port = 54827;
	}
	var socket = io.connect(urlSocket, {
		port: port
	});

	socket.on("connect", function () { //se connesso
		console.log("SUCCESSO!");
	});
	socket.on("error", function (data) { //se fallito
		console.log("ERRORE!");
	});
	socket.on("connect_failed", function (data) {
		console.log("ERRORE CONNECT_FAILED!");
	});

	return Controller.extend("it.greenorange.mes.controller.main", {
		cid: [],
		index: 0,
		/* start controller */
		onInit: function () {
			var oRouter = sap.ui.core.UIComponent.getRouterFor(this);
			oRouter.getRoute("main").attachMatched(this._getUserLogged, this);

			this._mViewSettingsDialogs = {};
			var oPromise = sap.ui.getVersionInfo({
				async: true
			});
			oPromise.then(function (oVersionInfo) {
				oVersion = oVersionInfo.version;
			});
			var that = this;
			socket.on("sosp", function (msg) {
				console.log("SOSPENSIONEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE");
				//se avviene una sospensione
				var sensorid = msg.replace(/\s/g, '');
				sensorid = sensorid.split(":")[1];
				console.log("SOSPENSIONEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE: sensore-> " + sensorid);
				// verificare se c'è già una sospensione attiva per quel sensore in modo da impedirne una ulteriore
				var selectedMacchinario = _.find(this.getView().getModel().getProperty("/impianti"), {
					sensorId: sensorid
				});
				if (selectedMacchinario && selectedMacchinario.login === "true") {
					console.log("SOSPENSIONEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE: statoMacchinario-> " + selectedMacchinario.statoMacchinario);
					if (selectedMacchinario.statoMacchinario === "READY") {
						if (this._oDialog && this._oDialog.isOpen()) {
							this.onExit();
						}
						if (selectedMacchinario.impianto !== itemSelected) {
							// se arriva la segnalazione di un device diverso dall'impianto in cui si trova l'applicazione, entro nel macchinario corretto
							_setSelectedItem(selectedMacchinario);
						}
						this.handleCommandCOM4();
					}
				}
			}.bind(this));

			socket.on("start", function (msg) {
				console.log("STARTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT");
				console.log(sensorid);
				//se avviene una sospensione
				var sensorid = msg.replace(/\s/g, '');
				sensorid = sensorid.split(":")[1];
				console.log("STARTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT: sensore-> " + sensorid);
				var device = "sensorId:" + sensorid;
				// verificare se c'è ancora una sospensione attiva per quel sensore in modo da chiudere l'eventuale pop up delle sospensioni ancora aperto
				var selectedMacchinario = _.find(this.getView().getModel().getProperty("/impianti"), {
					sensorId: sensorid
				});
				if (selectedMacchinario && selectedMacchinario.login === "true" && (selectedMacchinario.statoMacchinario === "SOSP" ||
						selectedMacchinario.statoMacchinario === "READY")) {
					console.log("STARTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT: statoMacchinario-> " + selectedMacchinario.statoMacchinario);
					// quando arriva lo start dal socket l'eventuale operazione selezionata va pulita
					operationSelected = "";
					// se il macchinario che ha registrato lo start è già in stato READY e ha già un'operazione in esecuzione, non bisogna fare nulla
					var execOperation = _.find(selectedMacchinario.operazioni, {
						statoOperazione: "EXEC",
						statoOperazioneEnh: "EXEC"
					});
					if (selectedMacchinario.statoMacchinario === "READY" && execOperation) {
						return;
					}
					if (selectedMacchinario.impianto !== itemSelected) {
						if (this._oDialog && this._oDialog.isOpen()) {
							this.onExit();
						}
						// se arriva la segnalazione di un device diverso dall'impianto in cui si trova l'applicazione, entro nel macchinario corretto
						_setSelectedItem(selectedMacchinario);
					}
					if (selectedMacchinario.statoMacchinario === "SOSP") {
						var fromSocket = true;
						this.onRemoveCOM4(fromSocket);
					} else if (selectedMacchinario.statoMacchinario === "READY") {
						if (this._oDialog && this._oDialog.isOpen()) {
							return;
						}
						this.handleConfirmpreCOM1();
					}
				}
			}.bind(this));

			socket.on("measure", function (data) {
				var oModel = this.getView().getModel();
				var oArray = oModel.getData();
				var sensorId = data.deviceId;
				var selectedMacchinario = _.find(oArray.impianti, {
					sensorId: sensorId
				});
				var oldMeasure = _.clone(selectedMacchinario.measure);
				var newMeasure = data.misura;
				selectedMacchinario.measure = newMeasure;
				oModel.setData(oArray);
				if (selectedMacchinario.statoMacchinario === "SOSP") {
					var pezziPerRipartenza = parseFloat(selectedMacchinario.pezziPerRipartenza);
					if (parseFloat(newMeasure) >= (selectedMacchinario.stoppedMeasure + pezziPerRipartenza)) {
						// se arriva la segnalazione di un device diverso dall'impianto in cui si trova l'applicazione, entro nel macchinario corretto
						_setSelectedItem(selectedMacchinario);
						var fromSocket = true;
						this.onRemoveCOM4(fromSocket);
					}
				}
			}.bind(this));

			var _setSelectedItem = function (selectedMacchinario) {
				var tabContainer = this.getView().byId("myTabContainer");
				var itemsTab = tabContainer.getItems();
				var itemTabToSelect = _.find(itemsTab, function (n) {
					return n.getName() === selectedMacchinario.impianto;
				});
				tabContainer.setSelectedItem(itemTabToSelect);
			}.bind(this);

			var oClock = this.getView().byId("oClock");
			var result = this.GetClock();
			oClock.setText(result);
			setInterval(function () {
				var result = that.GetClock();
				oClock.setText(result);
			}, 1000);
		},

		_getUserLogged: function () {
			var url = "/services/userapi/currentUser";
			$.ajax({
				url: url,
				type: "GET",
				dataType: "text",
				contentType: "application/x-www-form-urlencoded",
				success: function (data, textStatus, jqXHR) {
					// set the user details
					var userModel = new sap.ui.model.json.JSONModel();
					userModel.setData(JSON.parse(data));
					this.getView().setModel(userModel, "userapi");

					this.getMacchinari();
					var oTabContainer = this.getView().byId("myTabContainer");
					oTabContainer.addStyleClass("tabContainer");
					oTabContainer.addEventDelegate({
						onAfterRendering: function () {
							var oTabStrip = this.getAggregation("_tabStrip");
							var oItems = oTabStrip.getItems();
							for (var i = 0; i < oItems.length; i++) {
								var oCloseButton = oItems[i].getAggregation("_closeButton");
								oCloseButton.setVisible(false);
							}
						}
					}, oTabContainer);
				}.bind(this),
				error: function (xhr, status) {
					sap.ui.core.BusyIndicator.hide();
					that.messageError(that, xhr.responseText);
					return;
				}
			});
		},

		GetClock: function () {
			var tday = new Array("Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday");
			var tmonth = new Array("January", "February", "March", "April", "May", "June", "July", "August", "September", "October",
				"November",
				"December");
			var d = new Date();
			var nday = d.getDay(),
				nmonth = d.getMonth(),
				ndate = d.getDate(),
				nyear = d.getYear(),
				nhour = d.getHours(),
				nmin = d.getMinutes(),
				nsec = d.getSeconds(),
				ap;
			if (nhour === 0) {
				ap = " AM";
				nhour = 12;
			} else if (nhour < 12) {
				ap = " AM";
			} else if (nhour === 12) {
				ap = " PM";
			} else if (nhour > 12) {
				ap = " PM";
				nhour -= 12;
			}
			if (nyear < 1000) nyear += 1900;
			if (nmin <= 9) nmin = "0" + nmin;
			if (nsec <= 9) nsec = "0" + nsec;
			var result = "" + tday[nday] + ", " + tmonth[nmonth] + " " + ndate + ", " + nyear + " " + nhour + ":" + nmin + ":" + nsec + ap +
				"";
			return result;
		},

		_setLoginInputFocus: function (time) {
			if (!time) {
				time = 2000;
			}
			setTimeout(function () {
				var input = $("[id*=txtLogin]:input");
				$(input).focus();
				$(input).select();
			}, time);
		},

		/* upload macchinari from user */
		getMacchinari: function () {
			sap.ui.core.BusyIndicator.show();
			var that = this;
			var oView = that.getView();
			var request = "";
			var response = "";
			var oModel = new sap.ui.model.json.JSONModel();
			var oUserModel = oView.getModel("userapi").getData();
			$.ajax({
				url: "/MOROCOLOR_HUB/getMacchinari?idcm='" + oUserModel.name + "'",
				type: "GET",
				data: request,
				dataType: "text",
				contentType: "application/x-www-form-urlencoded",
				success: function (data, textStatus, jqXHR) {
					sap.ui.core.BusyIndicator.hide();
					response = data;
				},
				error: function (xhr, status) {
					sap.ui.core.BusyIndicator.hide();
					that.messageError(that, xhr.responseText);
					return;
				},
				complete: function (xhr, status) {
					sap.ui.core.BusyIndicator.hide();
					oView.setModel(getMacchinariModel());
				}
			});

			function getMacchinariModel() {
				var parser = new DOMParser();
				var xmlDoc = parser.parseFromString(response, "text/xml");
				var returnVal = xmlDoc.getElementsByTagName("getMacchinari")[0].childNodes[0].nodeValue;
				var oData = $.parseJSON(returnVal);
				if (oData.response.Status !== 200) {
					var msgError = !!that.getView().$().closest(".sapUiSizeCompact").length;
					MessageBox.error(
						oData.response.Message, {
							styleClass: msgError ? "sapUiSizeCompact" : ""
						}
					);
				}
				for (var i = 0; i < oData.impianti.length; i++) {
					oData.impianti[i].cid = "";
					oData.impianti[i].operatori = "";
					oData.impianti[i].login = "false";
					oData.impianti[i].centroDiLavoro = "";
					oData.impianti[i].chiaveComando = "";
					oData.impianti[i].operazioni = "";
					oData.impianti[i].chkTeamLeader = false;
					oData.impianti[i].ordine = "";
					oData.impianti[i].operazione = "";
					oData.impianti[i].idsessione = "";
					oData.impianti[i].statoMacchinario = "";
					oData.impianti[i].icon = "sap-icon://locked";
					oData.impianti[i].measure = "0.000";
				}
				oModel.setData(oData, "impianti");
				return oModel;
			}
		},

		/*-- LOGIN LOGIN LOGIN LOGIN LOGIN LOGIN LOGIN LOGIN LOGIN LOGIN LOGIN LOGIN   --*/
		onLogin: function () {
			var that = this;
			var oView = this.getView();
			var oArray = this.getView().getModel().getData();
			var oUserModel = this.getView().getModel("userapi").getData();
			for (var i = 0; i < oArray.impianti.length; i++) {
				var row = oArray.impianti[i];
				if (row.impianto === itemSelected) {
					var leader = row.cid;
					var idcm = oUserModel.name;
					var ipmacchinario = row.ipMacchinario;
					var chkLeader = row.chkTeamLeader;
					getUrl = "/MOROCOLOR_HUB/loginMacchinario?idcm='" + oUserModel.name + "'&ipmacchinario='" + row.ipMacchinario + "'&cid='"; // +	leader + "'";
				}
			}
			// triggers validation
			if (!leader.length) {
				var msgleader = !!that.getView().$().closest(".sapUiSizeCompact").length;
				MessageBox.error(
					"Inserimento non valido!", {
						styleClass: msgleader ? "sapUiSizeCompact" : ""
					}
				);
				return;
			}
			// check if leader is team leader
			if (chkLeader) {
				var oCIDModel = new JSONModel({
					utenti: [{
						cid: leader
					}]
				});
				oView.setModel(oCIDModel, "utenti");
				if (!that._oDialog) {
					//var oView = that.getView();
					Fragment.load({
						id: oView.getId(),
						name: "it.greenorange.mes.view.CID",
						controller: that
					}).then(function (oDialog) {
						that._oDialog = oDialog;
						that._oDialog.setModel(oCIDModel, "utenti");
						oView.addDependent(that._oDialog);
						that._oDialog.open();
					}.bind(this));
				} else {
					that._oDialog.open();
				}
			} else {
				getUrl += leader + "'";
				that.modelUpdateCid(leader);
				that.loginMacchinario(that, oView, oArray, getUrl);
			}
		},

		loginMacchinario: function (that, oView, oArray, getUrl) {
			sap.ui.core.BusyIndicator.show();
			var request = "";
			var response = "";
			// prima di tutto faccio il logout per chiudere eventuali sessioni precedenti rimaste aperte
			var selectedMacchinario = _.find(oArray.impianti, {
				impianto: itemSelected
			});
			var logoutUrl = "/MOROCOLOR_HUB/com2?sensorid='" + selectedMacchinario.sensorId + "'&completo=true";
			$.ajax({
				url: logoutUrl,
				type: "GET",
				data: request,
				dataType: "text",
				contentType: "application/x-www-form-urlencoded",
				success: function () {
					// non mi interessa di cosa c'è nella response perché potrebbero tornare degli errori come "La sessione è già stata chiusa" e quindi impedire la login
					// l'importante è che la chiamata sia entrata in funzione di successo così si può procedere con la login
					loginMacchinarioRequest(that, oView, oArray, getUrl);
				},
				error: function (xhr, status) {
					sap.ui.core.BusyIndicator.hide();
					that.messageError(that, xhr.responseText);
					return;
				}
			});
			var loginMacchinarioRequest = function () {
				$.ajax({
					url: getUrl,
					type: "GET",
					data: request,
					dataType: "text",
					contentType: "application/x-www-form-urlencoded",
					success: function (data, textStatus, jqXHR) {
						sap.ui.core.BusyIndicator.hide();
						response = data;
					},
					error: function (xhr, status) {
						sap.ui.core.BusyIndicator.hide();
						that.messageError(that, xhr.responseText);
						return;
					},
					complete: function (xhr, status) {
						sap.ui.core.BusyIndicator.hide();
						oView.setModel(that.getLoginMacchinarioModel(oView, oArray, response, getUrl));
						that.getView().setModel(that.getMacchinarioUserLoggedIn(oView.getModel()), "usersModel");
						setTimeout(function () {
							// porto il focus sul searchFor
							var macchinari = that.getView().getModel().getProperty("/impianti");
							var selectedMacchinario = _.find(macchinari, {
								impianto: itemSelected
							});
							var layout = selectedMacchinario.layout;
							var searchForInputId = "idSearchFor" + layout;
							var input = $("[id*=" + searchForInputId + "]:input");
							$(input).focus();
							$(input).select();
						}, 500);
					}
				});
			}
		},

		getLoginMacchinarioModel: function (oView, oArray, response, getUrl) {
			var that = this;
			var oModel = new sap.ui.model.json.JSONModel();
			var parser = new DOMParser();
			var xmlDoc = parser.parseFromString(response, "text/xml");
			var returnVal = xmlDoc.getElementsByTagName("loginMacchinario")[0].childNodes[0].nodeValue;
			var oData = $.parseJSON(returnVal);
			if (oData.response.Status !== 200) {
				var msgleader = !!that.getView().$().closest(".sapUiSizeCompact").length;
				MessageBox.error(
					oData.response.Message, {
						styleClass: msgleader ? "sapUiSizeCompact" : ""
					}
				);
				for (var i = 0; i < oArray.impianti.length; i++) {
					var row = oArray.impianti[i];
					if (row.impianto === itemSelected) {
						row.cid = "";
					}
				}
				oModel.setData(oArray);
				return oModel;
			}
			this._clearTableSelection();
			// verifico di definire un unico team leader tra gli eventuali n operatori loggati;
			// per fare questo prendo il primo cid che è stato passato nell'url
			var stringLoggedCid = getUrl.split("cid='")[1];
			stringLoggedCid = stringLoggedCid.replace("'", "");
			var loggedCid = stringLoggedCid.split("-");
			if (loggedCid.length > 1) {
				_.forEach(oData.operatori.accettati, function (n) {
					if (n.cid !== loggedCid[0]) {
						n.teamLeader = false;
					}
				});
			}
			for (var i = 0; i < oArray.impianti.length; i++) {
				var row = oArray.impianti[i];
				if (row.impianto === itemSelected) {
					row.centroDiLavoro = oData.impianto.centroDiLavoro;
					if (oData.impianto.operazioni.length) {
						row.chiaveComando = oData.impianto.operazioni.length ? oData.impianto.operazioni[0].chiaveComando : "";
					}
					row.operazioni = that._setOperazioniOrder(oData.impianto.operazioni);
					// setto il numero delle righe visualizzabili della tabella
					// prima verifico che non ci siano già altri macchinari con la proprietà salvata
					var othRowsNumber = _.find(oArray.impianti, function (n) {
						return n.rowsNumber;
					});
					row.rowsNumber = othRowsNumber ? othRowsNumber.rowsNumber : 10;
					row.operatori = oData.operatori;
					row.login = "true";
					row.idsessione = oData.idSessione;
					row.statoMacchinario = oData.impianto.statoMacchinario;
					row.icon = row.statoMacchinario === "SOSP" ? "sap-icon://alert" : "sap-icon://instance";
					for (var j = 0; j < row.operazioni.length; j++) {
						if (row.operazioni[j].statoOperazione === "EXEC" && row.operazioni[j].ipMacchinarioExec === ipMacchinarioSelected) {
							row.operazioni[j].statoOperazioneEnh = "EXEC"
						} else if (row.operazioni[j].statoOperazione === "EXEC" && row.operazioni[j].ipMacchinarioExec != ipMacchinarioSelected) {
							row.operazioni[j].statoOperazioneEnh = "EXET"
						} else {
							row.operazioni[j].statoOperazioneEnh = row.operazioni[j].statoOperazione;
						}
						row.operazioni[j].triggerLawer = row.triggerLawer;
					}
					socket.emit("deviceRoom", {
						deviceId: row.ipMacchinario,
						sensorId: row.sensorId
					}); //ho simulato il login, quando avviene, per un macchinario
					socket.on("roomAssigned", function (msg) { //tale macchinario si iscrive ad una Room e riceverà
					});
					row.operazioni = that._setOperazioniOrder(row.operazioni);
					oModel.setData(oArray);
					oModel.updateBindings();
					break;
				}
			}
			that.getView().byId("btnExit").setEnabled(true);
			return oModel;
		},

		getMacchinarioUserLoggedIn: function (oModel) {
			var that = this;
			var oData = oModel.getData();
			var oArray;
			var oModelOperatori = new sap.ui.model.json.JSONModel();
			for (var i = 0; i < oData.impianti.length; i++) {
				var row = oData.impianti[i];
				if (row.impianto === itemSelected) {
					oArray = row.operatori.accettati;
					break;
				}
			}
			if (!oArray) {
				oArray = [];
			}
			oModelOperatori.setData({
				messagesLength: oArray.length + ''
			});
			oModelOperatori.setData(oArray);
			return oModelOperatori;
		},

		onLoginMacchinario: function () {
			/*----------------------------------- REAL DATA ----------------------------------------------*/
			var that = this;
			var oView = that.getView();
			var oArray = that.getView().getModel().getData();
			var oModel = new sap.ui.model.json.JSONModel();
			var request = "";
			var response = "";
			var oUserModel = that.getView().getModel("userapi").getData();
			for (var i = 0; i < oArray.impianti.length; i++) {
				var row = oArray.impianti[i];
				if (row.impianto === itemSelected) {
					var leader = row.cid;
					var idcm = oUserModel.name;
					var ipmacchinario = row.ipMacchinario;
					var chkLeader = row.chkTeamLeader;
					getUrl = "/MOROCOLOR_HUB/loginMacchinario?idcm='" + idcm + "'&ipmacchinario='" + ipmacchinario + "'&cid='"; // +	leader + "'";
				}
			}
			// triggers validation
			if (!leader.length) {
				var msgleader = !!that.getView().$().closest(".sapUiSizeCompact").length;
				MessageBox.error(
					"Inserimento non valido!", {
						styleClass: msgleader ? "sapUiSizeCompact" : ""
					}
				);
				return;
			}
			// check if leader is team leader
			if (chkLeader) {
				that.handleCommandTEAM(that, oView, leader);
			} else {
				getUrl += leader + "'";
				that.modelUpdateCid(leader);
				that.loginMacchinario(that, oView, oArray, getUrl);
			}
		},

		handleUserPopoverPress: function (oEvent) {
			var that = this;
			var oView = that.getView();
			var request = "";
			var response = "";
			var operazione = "";
			var oUsersDialogModel = new sap.ui.model.json.JSONModel();
			var oArray = that.getView().getModel().getData();
			for (var i = 0; i < oArray.impianti.length; i++) {
				var row = oArray.impianti[i];
				if (row.impianto === itemSelected) {
					var oComponentiModel = row.operatori;
					oUsersDialogModel.setData(oComponentiModel);
				}
			}
			// nascondo l'input di inserimento user
			oUsersDialogModel.setProperty("/inputVisible", false);
			// verifico se mostrare il bottone di Aggiungi utente
			var isTeamLeader = _.find(this.getView().getModel("usersModel").getData(), {
				teamLeader: true
			});
			oUsersDialogModel.setProperty("/isTeamLeader", !!isTeamLeader);
			if (!!isTeamLeader) {
				oUsersDialogModel.setProperty("/inputValue", "");
				oUsersDialogModel.setProperty("/inputVisible", true);
			}
			var oButton = oEvent.getSource();
			if (!this.usersDialog) {
				this.usersDialog = sap.ui.xmlfragment("it.greenorange.mes.view.UTENTI", this);
				this.getView().addDependent(this.usersDialog);
			}
			this.usersDialog.setModel(oUsersDialogModel);
			this.usersDialog.open();
		},

		onCloseUserPress: function (oEvent) {
			this.usersDialog.close();
		},

		onConfirmUserPress: function () {
			var macchinari = this.getView().getModel().getProperty("/impianti");
			var oUsersDialogModel = this.usersDialog.getModel();
			var macchinario = _.find(macchinari, {
				impianto: itemSelected
			});
			var showMessageError = function (msg) {
				oUsersDialogModel.setProperty("/inputValue", "");
				if (!msg) {
					msg = "Non è stato possibile aggiungere l'utente indicato";
				}
				sap.m.MessageBox.error(msg);
			}
			if (!macchinario) {
				showMessageError();
			}
			var idSessione = macchinario.idsessione;
			var ipMacchinario = macchinario.ipMacchinario
			var cidValue = oUsersDialogModel.getProperty("/inputValue");
			var url = "/MOROCOLOR_HUB/aggiungiUtente" +
				"?ipmacchinario='" + ipMacchinario + "'&cid='" + cidValue + "'&idsessione='" + idSessione + "'";
			this.usersDialog.setBusy(true);
			$.ajax({
				url: url,
				type: "GET",
				data: "",
				dataType: "text",
				contentType: "application/x-www-form-urlencoded",
				success: function (data, textStatus, jqXHR) {
					var parser = new DOMParser();
					var xmlDoc = parser.parseFromString(data, "text/xml");
					var elementByTagName = xmlDoc.getElementsByTagName("aggiungiUtente");
					if (elementByTagName.length && elementByTagName[0].childNodes.length) {
						var returnVal = elementByTagName[0].childNodes[0].nodeValue;
						var oData = $.parseJSON(returnVal);
						if (oData.response.Status === 200) {
							// se sto aggiungendo un macchinario significa che sono teamLeader e quindi setto la seguente proprietà a true
							macchinario.chkTeamLeader = true;
							var newUserLogged = oData.utente;
							macchinario.cid += "-" + newUserLogged.cid;
							macchinario.operatori.accettati.push(newUserLogged);
							var viewModel = this.getView().getModel();
							viewModel.refresh();
							this.getView().setModel(this.getMacchinarioUserLoggedIn(viewModel), "usersModel");
							this.modelUpdateCid(macchinario.cid);
							oUsersDialogModel.setProperty("/inputValue", "");
						} else {
							showMessageError(oData.response.Message);
						}
					} else {
						showMessageError();
					}
					this.usersDialog.setBusy(false);
				}.bind(this),
				error: function (xhr, status) {
					sap.ui.core.BusyIndicator.hide();
					that.messageError(that, xhr.responseText);
					return;
				}
			});
		},

		handleBancaliPopoverPress: function (oEvent) {
			sap.ui.core.BusyIndicator.show();
			var that = this;
			var oView = that.getView();
			var request = "";
			var response = "";
			var ipMacchinario = "";
			var oModel = new sap.ui.model.json.JSONModel();
			var oArray = that.getView().getModel().getData();
			for (var i = 0; i < oArray.impianti.length; i++) {
				var row = oArray.impianti[i];
				if (row.impianto === itemSelected) {
					ipMacchinario = row.ipMacchinario;
				}
			}
			var oUserModel = oView.getModel("userapi").getData();
			getUrl = "/MOROCOLOR_HUB/getBancali" +
				"?ipmacchinario='" + ipMacchinario + "'";
			sap.ui.core.BusyIndicator.show();
			$.ajax({
				url: getUrl,
				type: "GET",
				data: request,
				dataType: "text",
				contentType: "application/x-www-form-urlencoded",
				success: function (data, textStatus, jqXHR) {
					sap.ui.core.BusyIndicator.hide();
					response = data;
				},
				error: function (xhr, status) {
					sap.ui.core.BusyIndicator.hide();
					that.messageError(that, xhr.responseText);
					return;
				},
				complete: function (xhr, status) {
					sap.ui.core.BusyIndicator.hide();
					var oBancaliModel = that.getBancaliModel(response, oModel, that);
					if (!that._oDialog) {
						Fragment.load({
							id: "fragmentNavCon",
							name: "it.greenorange.mes.view.BANCALI",
							controller: that
						}).then(function (oDialog) {
							that._oDialog = oDialog;
							that._oDialog.setModel(oBancaliModel);
							that._oDialog.getModel().setProperty("/SelectedIndices", []);
							oView.addDependent(that._oDialog);
							that._oDialog.setEscapeHandler(this.onExit);
							that._oDialog.open();
						}.bind(that));
					} else {
						that._oDialog.open();
					}
				}
			});
		},

		onNavToVersamenti: function (oEvent) {
			var that = this;
			var request = "";
			var response = "";
			var oModel = new sap.ui.model.json.JSONModel();
			var oButton = oEvent.getSource(); // ThumbsUp Button in the row
			// Get binding context of the button to identify the row where the event is originated
			var oBindingContext = oButton.getBindingContext(); // <<<-- If you have model name pass it here as string
			var oBindingObject = oBindingContext.getObject(); // getPath() method gives path to model row number
			var oNavCon = Fragment.byId("fragmentNavCon", "navCon");
			var oDetailPage = Fragment.byId("fragmentNavCon", "detail");
			oNavCon.to(oDetailPage);
			oModel.setData(oBindingObject);
			oDetailPage.setModel(oModel);
			this._oDialog.focus();
		},

		handleBancaliAll: function (oEvent) {
			sap.ui.core.BusyIndicator.show();
			var that = this;
			var oView = that.getView();
			var request = "";
			var response = "";
			var ipMacchinario = "";
			var oModel = new sap.ui.model.json.JSONModel();
			var oArray = that.getView().getModel().getData();
			for (var i = 0; i < oArray.impianti.length; i++) {
				var row = oArray.impianti[i];
				if (row.impianto === itemSelected) {
					ipMacchinario = row.ipMacchinario;

				}
			}
			var oUserModel = oView.getModel("userapi").getData();
			getUrl = "/MOROCOLOR_HUB/getBancali";
			sap.ui.core.BusyIndicator.show();
			$.ajax({
				url: getUrl,
				type: "GET",
				data: request,
				dataType: "text",
				contentType: "application/x-www-form-urlencoded",
				success: function (data, textStatus, jqXHR) {
					sap.ui.core.BusyIndicator.hide();
					response = data;
				},
				error: function (xhr, status) {
					sap.ui.core.BusyIndicator.hide();
					that.messageError(that, xhr.responseText);
					return;
				},
				complete: function (xhr, status) {
					sap.ui.core.BusyIndicator.hide();
					var oBancaliModel = that.getBancaliModel(response, oModel, that);
					if (!that._oDialog) {
						Fragment.load({
							id: "fragmentNavCon",
							name: "it.greenorange.mes.view.BANCALI",
							controller: that
						}).then(function (oDialog) {
							that._oDialog = oDialog;
							that._oDialog.setModel(oBancaliModel);
							that._oDialog.getModel().setProperty("/SelectedIndices", []);
							oView.addDependent(that._oDialog);
							that._oDialog.setEscapeHandler(this.onExit);
							that._oDialog.open();
						}.bind(that));
					} else {
						that._oDialog.setModel(oBancaliModel);
						that._oDialog.getModel().setProperty("/SelectedIndices", []);
						oView.addDependent(that._oDialog);
						that._oDialog.setEscapeHandler(this.onExit);
						that._oDialog.open();
					}
				}
			});
		},

		getBancaliModel: function (response, oModel, that) {
			var parser = new DOMParser();
			var xmlDoc = parser.parseFromString(response, "text/xml");
			var returnVal = xmlDoc.getElementsByTagName("getBancali")[0].childNodes[0].nodeValue;
			var oData = $.parseJSON(returnVal);
			if (oData.response.Status !== 200) {
				var msgError = !!that.getView().$().closest(".sapUiSizeCompact").length;
				MessageBox.error(
					oData.response.Message, {
						styleClass: msgError ? "sapUiSizeCompact" : ""
					}
				);
			} else {
				MessageToast.show(oData.response.Message, {
					duration: 2000
				});
			}
			var bancali = that._getBancaliData(oData.bancali);
			oModel.setData(oData);
			return oModel;
		},

		_getBancaliData: function (bancali) {
			for (var i = 0; i < bancali.length; i++) {
				var bancale = bancali[i];
				var qtaTot = 0;
				var qtaColliTot = 0;
				var versamenti = bancale.versamenti;
				for (var j = 0; j < versamenti.length; j++) {
					qtaTot += versamenti[j].quantita;
					qtaColliTot += versamenti[j].quantitaColli;
				}
				var oldVersamento = _.minBy(versamenti, function (n) {
					return new Date(n.data)
				});
				bancale.dataCreazione = oldVersamento.data;
				bancale.qtaTot = qtaTot.toFixed(2);
				bancale.qtaColliTot = qtaColliTot.toFixed(2);
			}
			return bancali;
		},

		getSchedaProdotto: function (oEvent) {
			var oButton = oEvent.getSource(); // ThumbsUp Button in the row
			// Get binding context of the button to identify the row where the event is originated
			var oBindingContext = oButton.getBindingContext(); // <<<-- If you have model name pass it here as string
			var oBindingObject = oBindingContext.getObject(); // getPath() method gives path to model row number
			var that = this;
			var oView = that.getView();
			var request = "";
			var response = "";
			var oOperazioneModel = "";
			var oModel = new sap.ui.model.json.JSONModel();
			var oArray = that.getView().getModel().getData();

			for (var i = 0; i < oArray.impianti.length; i++) {
				var row = oArray.impianti[i];
				if (row.impianto === itemSelected) {
					var ipmacchinario = row.ipMacchinario;
				}
			}

			getUrl = "/MOROCOLOR_HUB/getScheda?ordine='" +
				oBindingObject.ordine +
				"'&operazione='" +
				oBindingObject.operazione + "'";

			sap.ui.core.BusyIndicator.show();
			$.ajax({
				url: getUrl,
				type: "GET",
				data: request,
				dataType: "text",
				contentType: "application/x-www-form-urlencoded",
				success: function (data, textStatus, jqXHR) {
					sap.ui.core.BusyIndicator.hide();
					response = data;
				},
				error: function (xhr, status) {
					sap.ui.core.BusyIndicator.hide();
					that.messageError(that, xhr.responseText);
					return;
				},
				complete: function (xhr, status) {
					sap.ui.core.BusyIndicator.hide();
					var base64EncodedPDF = getBase64EncodedPDF(); // the encoded string
					var decodedPdfContent = atob(base64EncodedPDF);
					var byteArray = new Uint8Array(decodedPdfContent.length)
					for (var i = 0; i < decodedPdfContent.length; i++) {
						byteArray[i] = decodedPdfContent.charCodeAt(i);
					}
					var blob = new Blob([byteArray.buffer], {
						type: 'application/pdf'
					});
					var _pdfurl = URL.createObjectURL(blob);
					if (!this._PDFViewer) {
						this._PDFViewer = new sap.m.PDFViewer({
							width: "auto",
							source: _pdfurl // my blob url
						});
						jQuery.sap.addUrlWhitelist("blob"); // register blob url as whitelist
					}
					this._PDFViewer.open();
				}
			});

			function getBase64EncodedPDF() {
				var parser = new DOMParser();
				var xmlDoc = parser.parseFromString(response, "text/xml");
				var returnVal = "";
				if (xmlDoc.getElementsByTagName("getScheda")[0].childNodes.length) {
					returnVal = xmlDoc.getElementsByTagName("getScheda")[0].childNodes[0].nodeValue;
					return returnVal;
				}
				sap.m.MessageBox.error("Scheda prodotto non presente");
			}
		},

		/*-- GETRIEPILOGO                                                              --*/
		getRiepilogo: function (oEvent) {
			var oButton = oEvent.getSource(); // ThumbsUp Button in the row
			// Get binding context of the button to identify the row where the event is originated
			var oBindingContext = oButton.getBindingContext(); // <<<-- If you have model name pass it here as string
			var oBindingObject = oBindingContext.getObject(); // getPath() method gives path to model row number
			var that = this;
			var oView = that.getView();
			var request = "";
			var response = "";
			var oOperazioneModel = "";
			var oModel = new sap.ui.model.json.JSONModel();
			var oArray = that.getView().getModel().getData();
			var macchinario = _.find(oArray.impianti, {
				impianto: itemSelected
			});
			var ipmacchinario = macchinario.ipMacchinario;
			var bancali = macchinario.bancali;
			getUrl = "/MOROCOLOR_HUB/riep?ordine='" +
				oBindingObject.ordine +
				"'&operazione='" +
				oBindingObject.operazione +
				"'&ipmacchinario='" +
				ipmacchinario + "'";
			sap.ui.core.BusyIndicator.show();
			$.ajax({
				url: getUrl,
				type: "GET",
				data: request,
				dataType: "text",
				contentType: "application/x-www-form-urlencoded",
				success: function (data, textStatus, jqXHR) {
					sap.ui.core.BusyIndicator.hide();
					response = data;
				},
				error: function (xhr, status) {
					sap.ui.core.BusyIndicator.hide();
					that.messageError(that, xhr.responseText);
					return;
				},
				complete: function (xhr, status) {
					sap.ui.core.BusyIndicator.hide();
					var oRiepilogoModel = getRiepilogoModel(that);
					if (!that._oDialog) {
						Fragment.load({
							name: "it.greenorange.mes.view.RIEPILOGO",
							controller: that
						}).then(function (oDialog) {
							that._oDialog = oDialog;
							oRiepilogoModel.setProperty("/ordine", oBindingObject.ordine);
							oRiepilogoModel.setProperty("/operazione", oBindingObject.operazione);
							that._oDialog.setModel(oRiepilogoModel);
							that._oDialog.open();
						}.bind(that));
					} else {
						that._oDialog.open();
					}
					if (oBindingObject.toFix) {
						setTimeout(function () {
							var tabContainer = sap.ui.getCore().getElementById("myRiepContainer");
							var containerItems = tabContainer.getItems();
							for (var j = 0; j < containerItems.length; j++) {
								var item = containerItems[j];
								if (item.getProperty("name") === "Sospensioni") {
									tabContainer.setSelectedItem(item);
									break;
								}
							}
						});
					}
				}
			});

			function getRiepilogoModel() {
				var parser = new DOMParser();
				var xmlDoc = parser.parseFromString(response, "text/xml");
				var returnVal = xmlDoc.getElementsByTagName("riep")[0].childNodes[0].nodeValue;
				var oData = $.parseJSON(returnVal);
				if (oData.response.Status !== 200) {
					var msgError = !!that.getView().$().closest(".sapUiSizeCompact").length;
					MessageBox.error(
						oData.response.Message, {
							styleClass: msgError ? "sapUiSizeCompact" : ""
						}
					);
				}
				// aggiungo la proprietà isEditing alle sospensioni
				_.forEach(oData.riepilogo.sospensioni, function (n) {
					var isEditing = n.causale === "SIOT" ? true : false;
					n.isEditing = isEditing;
				});
				var azioni = oData.riepilogo.azioni;
				// rendo uniforme l'array delle azioni
				_.forEach(azioni, function (n) {
					n.chiaveCausale = n.chiaveCausale && n.chiaveCausale.trim() ? n.chiaveCausale : "";
				});
				_.forEach(oData.riepilogo.sospensioni, function (o) {
					var arrayAzioniPerRow = _.filter(azioni, function (n) {
						return n.chiaveCausale === o.causale || !n.chiaveCausale;
					});
					o.azioni = arrayAzioniPerRow;
					o.azione = o.azione ? o.azione : "";
				});
				var newData = {
					TableId: [{
						name: "Componenti",
						value: oData.riepilogo.componenti
					}, {
						name: "Sospensioni",
						value: oData.riepilogo.sospensioni
					}, {
						name: "Sessioni",
						value: oData.riepilogo.sessioni
					}],
					causali: oData.riepilogo.causali,
					azioni: oData.riepilogo.azioni,
				};
				if (bancali) {
					// il tab Versamenti non deve essere visibile nel caso in cui il macchinario non abbia la gestione bancali
					var versamenti = _getVersamentiTable(oData.riepilogo.versamenti);
					newData.TableId.unshift({
						name: "Versamenti",
						value: versamenti
					});
				}
				oModel.setData(newData);
				return oModel;
			};

			function _getVersamentiTable(versamenti) {
				if (!versamenti.length) {
					return versamenti;
				}
				var qtaTot = 0;
				for (var i = 0; i < versamenti.length; i++) {
					qtaTot += parseFloat(versamenti[i].quantitaVersata);
				}
				var rowToAdd = {
					idBancale: "TOTALE",
					quantitaVersata: qtaTot
				};
				versamenti.unshift(rowToAdd);
				return versamenti;
			};
		},

		onEditSospensionePress: function (evt) {
			this._setIsEditingRow(evt, true);
		},

		onCancelSospensionePress: function (evt) {
			this._setIsEditingRow(evt, false);
		},

		_setIsEditingRow: function (evt, isEditing) {
			var selectedSospensione = evt.getSource().getParent().getBindingContext().getObject();
			selectedSospensione.isEditing = isEditing;
			var model = this._oDialog.getModel();
			model.refresh();
		},

		onCausaleChange: function (evt) {
			var selectedSospensione = evt.getSource().getBindingContext().getObject();
			var selectedCausale = evt.getParameter("selectedItem").getParent().getBindingContext().getObject();
			var modelDialog = this._oDialog.getModel();
			var azioni = modelDialog.getProperty("/azioni");
			var arrayAzioniPerRow = _.filter(azioni, function (n) {
				return n.chiaveCausale === selectedCausale.causale || !n.chiaveCausale;
			});
			selectedSospensione.azioni = arrayAzioniPerRow;
			modelDialog.refresh();
		},

		onSaveSospensionePress: function (evt) {
			var response;
			var selectedSospensione = evt.getSource().getParent().getBindingContext().getObject();
			var causale = selectedSospensione.causale ? selectedSospensione.causale : "";
			var azione = selectedSospensione.azione ? selectedSospensione.azione : "";
			var noteCausali = selectedSospensione.noteCausali ? selectedSospensione.noteCausali : "";
			var noteAzioni = selectedSospensione.noteAzioni ? selectedSospensione.noteAzioni : "";
			getUrl = "/MOROCOLOR_HUB/updateSospensioneRiep?progressivo=" + selectedSospensione.progressivo + "&causale='" + causale +
				"'&notecausale='" + noteCausali + "'&azione='" + azione + "'&noteazione='" + noteAzioni +
				"'";
			sap.ui.core.BusyIndicator.show();
			$.ajax({
				url: getUrl,
				type: "POST",
				data: "",
				dataType: "text",
				contentType: "application/x-www-form-urlencoded",
				success: function (data, textStatus, jqXHR) {
					response = data;
				},
				error: function (xhr, status) {
					that.messageError(that, xhr.responseText);
					return;
				},
				complete: function (xhr, status) {
					sap.ui.core.BusyIndicator.hide();
					var parser = new DOMParser();
					var xmlDoc = parser.parseFromString(response, "text/xml");
					var returnVal = xmlDoc.getElementsByTagName("updateSospensioneRiep")[0].childNodes[0].nodeValue;
					var oData = $.parseJSON(returnVal);
					if (oData.response.Status !== 200) {
						var msgError = !!this.getView().$().closest(".sapUiSizeCompact").length;
						MessageBox.error(
							oData.response.Message, {
								styleClass: msgError ? "sapUiSizeCompact" : ""
							}
						);
					} else {
						var isEditing = selectedSospensione.causale === "SIOT" ? true : false;
						selectedSospensione.isEditing = isEditing;
						var modelDialog = this._oDialog.getModel();
						modelDialog.refresh();
						var viewModel = this.getView().getModel();
						this.onRefresh(viewModel);
					}
				}.bind(this)
			});
		},

		onCancelRiepilogo: function (oEvent) {
			if (this._oDialog) {
				this._oDialog.destroy();
				this._oDialog = undefined;
			}
		},

		onItemRipSelected: function (oEvent) {
			if (oEvent.getParameter("item") !== null && oEvent.getParameter("item") !== "undefined") {
				itemRipSelected = oEvent.getParameter("item").getName();
			}
		},

		handleCommandTEAM: function (that, oView, leader) {
			var oCIDModel = new JSONModel({
				utenti: [{
					cid: leader
				}]
			});
			oView.setModel(oCIDModel, "utenti");
			if (!that._oDialog) {
				Fragment.load({
					id: oView.getId(),
					name: "it.greenorange.mes.view.CID",
					controller: that
				}).then(function (oDialog) {
					that._oDialog = oDialog;
					that._oDialog.setModel(oCIDModel, "utenti");
					oView.addDependent(that._oDialog);
					that._oDialog.open();
				}.bind(that));
			} else {
				that._oDialog.open();
			}
		},

		modelUpdateCid: function (cid) {
			var oModel = new sap.ui.model.json.JSONModel();
			var oData = this.getView().getModel().getData();
			for (var i = 0; i < oData.impianti.length; i++) {
				var row = oData.impianti[i];
				if (row.impianto === itemSelected) {
					row.cid = cid;
					oModel.setData(oData);
					this.getView().setModel(oModel);
				}
			}
		},

		/* CID fragment events */
		onAddMemberCID: function (oEvent) {
			var oView = this.getView();
			var idCid = this.byId("idCid").getValue();
			if (idCid.length === 0) {
				var msgleader = !!this.getView().$().closest(".sapUiSizeCompact").length;
				MessageBox.error(
					"Inserimento non valido!", {
						styleClass: msgleader ? "sapUiSizeCompact" : ""
					}
				);
				return;
			}
			var oInputCID = new sap.m.Input({
				value: idCid,
				width: "auto",
				editable: false
			});
			var delButton = new sap.m.Button({
				icon: "sap-icon://delete",
				press: this.onDeleteMemberCID
			});
			delButton.addStyleClass("button");
			var _oCcLayout = new sap.m.FlexBox({
				items: [oInputCID, delButton]
			});
			this.byId("idDL").addContent(_oCcLayout);
			var oModel = oView.getModel("utenti");
			var oData = oModel.getData();
			oData.utenti.push({
				cid: idCid
			});
			oModel.updateBindings();
			this.byId("idCid").setValue("");
			this.index += 1;
		},

		onDeleteMemberCID: function (oEvent) {
			var that = this;
			var oModel = that.getModel("utenti");
			var oData = oModel.getData();
			var rowItemContainer = oEvent.getSource().getParent();
			var cid = rowItemContainer.getItems()[0].getProperty("value");
			_.remove(oData.utenti, {
				cid: cid
			});
			oModel.updateBindings();
			rowItemContainer.destroy();
		},

		onConfirmCID: function (oEvent) {
			var that = this;
			var cid = "";
			var oArray = that.getView().getModel().getData();
			var oView = that.getView();
			var oUser = that.getView().getModel("utenti").getData();
			try {
				for (var i = 0; i < oUser.utenti.length; i++) {
					if (i === 0) {
						cid = oUser.utenti[i].cid;
					} else {
						cid += "-" + oUser.utenti[i].cid;
					}
				}
				getUrl += cid + "'";
				that.modelUpdateCid(cid);
				that.loginMacchinario(that, oView, oArray, getUrl);
				if (that._oDialog) {
					that._oDialog.close();
					that._oDialog.destroy();
					that._oDialog = undefined;
				}
			} catch (e) {
				sap.m.MessageBox.error("Fill all required fields");
			}
		},

		onCancelCID: function (oEvent) {
			if (this._oDialog) {
				this._oDialog.close();
				this._oDialog.destroy();
				this._oDialog = undefined;
			}
		},

		/*-- LOGIN LOGIN LOGIN LOGIN LOGIN LOGIN LOGIN LOGIN LOGIN LOGIN LOGIN LOGIN   --*/
		onAfterRendering: function () {
			this._setLoginInputFocus();
		},

		createViewSettingsDialog: function (sDialogFragmentName) {
			var oDialog = this._mViewSettingsDialogs[sDialogFragmentName];
			if (!oDialog) {
				oDialog = sap.ui.xmlfragment(sDialogFragmentName, this);
				this._mViewSettingsDialogs[sDialogFragmentName] = oDialog;
			}
			return oDialog;
		},

		handleSortButtonPressed: function () {
			this.createViewSettingsDialog("it.greenorange.mes.view.SortDialog").open();
		},

		handleFilterButtonPressed: function () {
			this.createViewSettingsDialog("it.greenorange.mes.view.FilterDialog").open();
		},

		handleGroupButtonPressed: function () {
			this.createViewSettingsDialog("it.greenorange.mes.view.GroupDialog").open();
		},

		/*-- START	COM1	INIZIO LAVORO	Inizio Operazione Produttiva --*/
		onSearch: function (oEvent) {
			var that = this;
			var oModel = new sap.ui.model.json.JSONModel();
			var oData = that.getView().getModel().getData();
			var valueEntered = oEvent.getSource().getValue();
			var filterValue;
			var ordine = valueEntered.substring(0, 12);
			var sequenza = valueEntered.substring(13, valueEntered.length);
			for (var i = 0; i < oData.impianti.length; i++) {
				var impianti = oData.impianti[i];
				if (impianti.impianto === itemSelected) {
					for (var j = 0; j < impianti.operazioni.length; j++) {
						var operazione = impianti.operazioni[j];
						if (operazione.ordine === ordine && operazione.sequenza === sequenza) {
							impianti.chiaveComando = operazione.chiaveComando;
							impianti.ordine = operazione.ordine;
							impianti.operazione = operazione.operazione;
							oModel.setData(oData);
							that.getView().setModel(oModel);
							that.handleCommandCOM1(that, impianti.ordine, impianti.operazione, impianti.ipMacchinario, impianti.idsessione);
						}
					}
					break;
				}
			}
		},

		onPress: function (oEvent) {
			operationSelected = oEvent.getParameter("rowContext").getObject();
		},

		onPressScartoTable: function (oEvent) {
			var selectedItem = oEvent.getParameter("listItem");
			var selectedOperation = selectedItem.getBindingContext().getObject();
			if (selectedOperation.selected && !parseFloat(selectedOperation.scarto)) {
				var idSelectedItem = selectedItem.getId();
				var indexToStartString = idSelectedItem.indexOf("fragmentNavCon");
				var idInputScarto = idSelectedItem.substring(indexToStartString) + "-inner";
				var input = $("[id*=" + idInputScarto + "]:input")[0];
				setTimeout(function () {
					$(input).focus();
					$(input).select();
				});
			}
		},

		onPresspreCOM1: function (oEvent) {
			operationSelected = oEvent.getParameter("rowContext").getObject();
		},

		handleConfirmpreCOM1: function () {
			var that = this;
			that.onSelectionChange();
			that.onExit();
		},

		onSelectionChange: function () {
			var that = this;
			// se non c'è nessuna operazione selezionata e nessuna operazione in EXEC, allora apro il pop up di seleziona operazioni
			// check per verificare che non ci siano operazioni in EXEC
			var oModel = new sap.ui.model.json.JSONModel();
			var oData = that.getView().getModel().getData();
			var impianti = oData.impianti;
			var row = _.find(impianti, {
				impianto: itemSelected
			});
			var operazioni = row.operazioni;
			var operazioneExec = _.find(operazioni, {
				statoOperazione: "EXEC",
				statoOperazioneEnh: "EXEC"
			});
			if (!operationSelected) {
				if (!operazioneExec) {
					that.handleCommandPreCOM1()
				} else if (row.statoMacchinario === "SOSP") {
					// se il macchinario è in sospensione si toglie la sospensione
					that.onRemoveCOM4();
				}
				// se c'è l'operazione in EXEC allora si arriva direttamente al return e non succede nulla
				return;
			}
			row.chiaveComando = operationSelected.chiaveComando;
			row.ordine = operationSelected.ordine;
			row.operazione = operationSelected.operazione;
			oModel.setData(oData);
			that.getView().setModel(oModel);
			that.handleCommandCOM1(that, row.ordine, row.operazione, row.ipMacchinario, row.idsessione);
		},

		handleCommandPreCOM1: function (oEvent) {
			var that = this;
			var sensorId = "";
			var oView = that.getView();
			var oModel = new sap.ui.model.json.JSONModel();
			var oUserModel = oView.getModel("userapi").getData();
			sap.ui.core.BusyIndicator.hide();
			var oArray = that.getView().getModel().getData();
			if (typeof (oEvent) !== "undefined") {
				sensorId = oEvent.split(":");
			}
			if (!sensorId) {
				for (var i = 0; i < oArray.impianti.length; i++) {
					var row = oArray.impianti[i];
					if (row.impianto === itemSelected) {
						oModel.setData(row);
						break;
					}
				}
			} else {
				for (var i = 0; i < oArray.impianti.length; i++) {
					var row = oArray.impianti[i];
					if (row.sensorId === sensorId[1]) {
						oModel.setData(row);
						break;
					}
				}
			}
			if (!that._oDialog) {
				Fragment.load({
					name: "it.greenorange.mes.view.preCOM1",
					controller: that
				}).then(function (oDialog) {
					that._oDialog = oDialog;
					that._oDialog.setModel(oModel);
					oView.addDependent(that._oDialog);
					that._oDialog.open();
				}.bind(that));
			} else {
				that._oDialog.open();
			}
		},

		handleCommandCOM1: function (that, ordine, operazione, ipmacchinario, idsessione) {
			var oView = that.getView();
			var request = "";
			var response = "";
			var oModel = new sap.ui.model.json.JSONModel();
			var oUserModel = oView.getModel("userapi").getData();
			getUrl = "/MOROCOLOR_HUB/com1?ordine='" + ordine + "'&operazione='" + operazione + "'&ipmacchinario='" + ipmacchinario +
				"'&idsessione='" + idsessione + "'";
			sap.ui.core.BusyIndicator.show();
			$.ajax({
				url: getUrl,
				type: "GET",
				data: request,
				dataType: "text",
				contentType: "application/x-www-form-urlencoded",
				success: function (data, textStatus, jqXHR) {
					sap.ui.core.BusyIndicator.hide();
					response = data;
				},
				error: function (xhr, status) {
					sap.ui.core.BusyIndicator.hide();
					that.messageError(that, xhr.responseText);
					return;
				},
				complete: function (xhr, status) {
					sap.ui.core.BusyIndicator.hide();
					oView.setModel(getCom1Model(that));
				}
			});

			function getCom1Model(that) {
				var oArray = that.getView().getModel().getData();
				var parser = new DOMParser();
				var xmlDoc = parser.parseFromString(response, "text/xml");
				var returnVal = xmlDoc.getElementsByTagName("com1")[0].childNodes[0].nodeValue;
				var oData = $.parseJSON(returnVal);
				if (oData.response.Status !== 200) {
					var msgError = !!that.getView().$().closest(".sapUiSizeCompact").length;
					MessageBox.error(
						oData.response.Message, {
							styleClass: msgError ? "sapUiSizeCompact" : ""
						}
					);
				} else {
					MessageToast.show(oData.response.Message, {
						duration: 2000
					});
				}
				for (var i = 0; i < oArray.impianti.length; i++) {
					var row = oArray.impianti[i];
					if (row.impianto === itemSelected) {
						row.centroDiLavoro = oData.impianto.centroDiLavoro;
						row.operazioni = that._setOperazioniOrder(oData.impianto.operazioni);
						row.statoMacchinario = oData.impianto.statoMacchinario;
						row.icon = row.statoMacchinario === "SOSP" ? "sap-icon://alert" : "sap-icon://instance";
						row.login = "true";
						for (var j = 0; j < row.operazioni.length; j++) {
							if (row.operazioni[j].statoOperazione === "EXEC" && row.operazioni[j].ipMacchinarioExec === ipMacchinarioSelected) {
								row.operazioni[j].statoOperazioneEnh = "EXEC"
							} else if (row.operazioni[j].statoOperazione === "EXEC" && row.operazioni[j].ipMacchinarioExec != ipMacchinarioSelected) {
								row.operazioni[j].statoOperazioneEnh = "EXET"
							} else {
								row.operazioni[j].statoOperazioneEnh = row.operazioni[j].statoOperazione;
							}
						}
						oModel.setData(oArray);
						oModel.updateBindings();
					}
				}
				return oModel;
			}
		},

		/*-- START	COM1	INIZIO LAVORO	Inizio Operazione Produttiva --*/
		/*-- END 	COM2	FINE TURNO	Fine Turno Operatore --*/
		onLogout: function () {
			var that = this;
			var oView = that.getView();
			var oArray = oView.getModel().getData();
			for (var i = 0; i < oArray.impianti.length; i++) {
				var row = oArray.impianti[i];
				if (row.impianto === itemSelected) {
					if (row.chkTeamLeader && row.operatori.accettati.length > 1) {
						var oCIDModel = new sap.ui.model.json.JSONModel();
						oCIDModel.setData(row.operatori);
						if (!that._oDialog) {
							Fragment.load({
								id: oView.getId(),
								name: "it.greenorange.mes.view.logout",
								controller: that
							}).then(function (oDialog) {
								that._oDialog = oDialog;
								that._oDialog.setModel(oCIDModel);
								oView.addDependent(that._oDialog);
								that._oDialog.open();
								var dialogTableCid = oView.byId("cid");
								var content = dialogTableCid.getAggregation("_dialog").getAggregation("content");
								var usersTable = _.find(content, function (n) {
									return n.getId().indexOf("table") > 0;
								});
								usersTable.selectAll();
							}.bind(that));
						} else {
							that._oDialog.open();
						}
					} else {
						that.onConfirmLogout();
					}
				}
			}
		},

		removeElement: function (array, elem) {
			var index = array.indexOf(elem);
			if (index > -1) {
				array.splice(index, 1);
			}
		},

		onConfirmLogout: function (oEvent) {
			var that = this;
			var request = "";
			var response = "";
			var idsessione = "";
			var operatore = "";
			var completo = "";
			var ipmacchinario = "";
			var getUrl = "";
			var oView = this.getView();
			var oData = oView.getModel().getData();
			var oModel = new sap.ui.model.json.JSONModel();
			for (var i = 0; i < oData.impianti.length; i++) {
				var row = oData.impianti[i];
				if (row.impianto === itemSelected) {
					var cid = row.cid.split("-");
					if (typeof (oEvent) !== "undefined") {
						var items = oEvent.getParameters().selectedItems;
						for (var j = 0; j < items.length; j++) {
							var item = items[j];
							var context = item.getBindingContext();
							var autorizzato = context.getProperty(null, context);
							operatore += autorizzato.cid + "-";
						}
						operatore = operatore.slice(0, -1);
					} else {
						operatore = cid;
					}
					idsessione = row.idsessione;
					ipmacchinario = row.ipMacchinario;
					break;
				}
			}
			if (typeof (oEvent) !== "undefined") {
				if (checkUsers(operatore, cid)) {
					completo = checkCompleto(operatore, cid);
					getUrl = "/MOROCOLOR_HUB/com2?idsessione='" + idsessione + "'&ipmacchinario='" + ipmacchinario + "'&operatore='" +
						operatore + "'&completo=" + completo;
					sendCOM2(that, getUrl, operatore, completo);
				}
			} else {
				completo = true;
				getUrl = "/MOROCOLOR_HUB/com2?idsessione='" + idsessione + "'&ipmacchinario='" + ipmacchinario + "'&operatore='" +
					operatore + "'&completo=" + completo;
				sendCOM2(that, getUrl, operatore, completo);
			}
			if (this._oDialog) {
				this._oDialog.destroy();
				this._oDialog = undefined;
			}

			function checkUsers(operatore, cid) {
				var loggedOut = operatore.split("-");
				var findLeader = operatore.indexOf(cid[0], 0);
				// il team leader non è tra gli utenti che si stanno scollegando
				if (findLeader === -1) {
					return true;
				} else if (loggedOut.length === cid.length) {
					// tutti gli utenti si stanno scollegando	
					return true;
				} else {
					// si sta cercando di scollegare il team leader 
					var msgleader = !!that.getView().$().closest(".sapUiSizeCompact").length;
					MessageBox.error(
						"Errore! Si sta cercando di scollegare il team leader!", {
							styleClass: msgleader ? "sapUiSizeCompact" : ""
						}
					);
					return false;
				}
				return false;
			}

			function checkCompleto(operatore, cid) {
				var loggedOut = operatore.split("-");
				var findLeader = operatore.indexOf(cid[0], 0);
				// verifico se si stanno scollegano tutti gli utenti
				if (loggedOut.length === cid.length) {
					return true;
				} else {
					return false;
				}
			}

			function sendCOM2(that, getUrl, operatore, completo) {
				sap.ui.core.BusyIndicator.show();
				$.ajax({
					url: getUrl,
					type: "GET",
					data: request,
					dataType: "text",
					contentType: "application/x-www-form-urlencoded",
					success: function (data, textStatus, jqXHR) {
						sap.ui.core.BusyIndicator.hide();
						response = data;
					}.bind(this),
					error: function (xhr, status) {
						sap.ui.core.BusyIndicator.hide();
						that.messageError(that, xhr.responseText);
						return;
					},
					complete: function (xhr, status) {
						sap.ui.core.BusyIndicator.hide();
						oView.setModel(getCom2Model(that, operatore, completo));
					}
				});
			}

			function getCom2Model(that, operatore, completo) {
				var oArray = that.getView().getModel().getData();
				var parser = new DOMParser();
				var xmlDoc = parser.parseFromString(response, "text/xml");
				var returnVal = xmlDoc.getElementsByTagName("com2")[0].childNodes[0].nodeValue;
				var oData = $.parseJSON(returnVal);
				if (oData.response.Status !== 200) {
					var msgError = !!that.getView().$().closest(".sapUiSizeCompact").length;
					MessageBox.error(
						oData.response.Message, {
							styleClass: msgError ? "sapUiSizeCompact" : ""
						}
					);
				} else {
					MessageToast.show(oData.response.Message, {
						duration: 2000
					});
				}
				for (i = 0; i < oArray.impianti.length; i++) {
					row = oArray.impianti[i];
					if (row.impianto === itemSelected) {
						if (completo === true) {
							row.cid = "";
							row.operatori = "";
							row.login = "false";
							row.centroDiLavoro = "";
							row.chiaveComando = "";
							row.operazioni = "";
							row.chkTeamLeader = false;
							row.ordine = "";
							row.operazione = "";
							row.idsessione = "";
							row.statoMacchinario = "";
							row.icon = "sap-icon://locked";
							that._setLoginInputFocus(1000);
						} else {
							row = that.removeCID(row, operatore, completo);
						}
						oModel.setData(oArray);
						that.getView().setModel(that.getMacchinarioUserLoggedIn(oModel), "usersModel");
						MessageToast.show(oData.response.Message, {
							duration: 500
						});
					}
				}
				return oModel;
			}
		},

		onCancelLogout: function (oEvent) {
			if (this._oDialog) {
				this._oDialog.destroy();
				this._oDialog = undefined;
			}

		},

		removeCID: function (row, operatore, completo) {
			var that = this;
			var loggedOut = operatore.split("-");
			var allLoggedCid = row.cid.split("-");
			var operatoriAccettati = row.operatori.accettati;
			for (var i = 0; i < loggedOut.length; i++) {
				_.remove(allLoggedCid, function (o) {
					return o === loggedOut[i];
				});
				_.remove(operatoriAccettati, function (o) {
					return o.cid === loggedOut[i];
				});
			}
			var cid = "";
			for (var i = 0; i < allLoggedCid.length; i++) {
				cid += allLoggedCid[i] + "-";
			}
			row.cid = cid.substring(0, cid.length - 1);
			row.operatori.accettati = that.filterArray(operatoriAccettati, loggedOut);
			return row;
		},

		filterArray: function (src, filt) {
			var temp = {},
				i, result = [];
			// load contents of filt into an object 
			// for faster lookup
			for (i = 0; i < filt.length; i++) {
				temp[filt[i]] = true;
			}
			// go through each item in src
			for (i = 0; i < src.length; i++) {
				if (!(src[i].cid in temp)) {
					result.push(src[i]);
				}
			}
			return (result);
		},
		/*-- END	COM2	FINE TURNO	Fine Turno Operatore --*/

		/*-- SOSP	COM4	CAUSALE SOSPENSIONE(Tab L3)	Fermo Impianto (Spec. Causale) --*/
		handleCommandCOM4: function () {
			var response = "";
			var oModel = new sap.ui.model.json.JSONModel();
			var that = this;
			var oView = that.getView();
			var viewModel = oView.getModel();
			var macchinari = viewModel.getProperty("/impianti");
			var selectedMacchinario = _.find(macchinari, {
				impianto: itemSelected
			});
			if (selectedMacchinario.measure) {
				selectedMacchinario.stoppedMeasure = parseFloat(selectedMacchinario.measure);
			}
			// se l'operazione che è presente nell'oggetto selectedMacchinario è in esecuzione, allora è corretto passarla, altrimenti va passata operazione e ordine come stringa vuota
			var selectedOperazione = _.find(selectedMacchinario.operazioni, {
				ordine: selectedMacchinario.ordine,
				operazione: selectedMacchinario.operazione
			});
			var ipMacchinarioSelected = selectedMacchinario.ipMacchinario;
			var sensorIdSelected = selectedMacchinario.sensorId;
			var ordine = selectedOperazione && selectedOperazione.statoOperazioneEnh === "EXEC" ? selectedMacchinario.ordine : "";
			var operazione = selectedOperazione && selectedOperazione.statoOperazioneEnh === "EXEC" ? selectedMacchinario.operazione : "";
			var operatore = selectedMacchinario.cid;
			var ipmacchinario = selectedMacchinario.ipMacchinario;
			if (!ordine) {
				getUrl = "/MOROCOLOR_HUB/getCausali?operatore='" + operatore + "'&ipmacchinario='" + ipmacchinario + "'&causale='SIOT'";
			} else {
				getUrl = "/MOROCOLOR_HUB/getCausali?ordine='" + ordine + "'&operazione='" + operazione +
					"'&operatore='" + operatore + "'&ipmacchinario='" + ipmacchinario + "'&causale='SIOT'";
			}
			sap.ui.core.BusyIndicator.show();
			$.ajax({
				url: getUrl,
				type: "GET",
				dataType: "text",
				contentType: "application/x-www-form-urlencoded",
				success: function (data, textStatus, jqXHR) {
					sap.ui.core.BusyIndicator.hide();
					response = data;
				},
				error: function (xhr, status) {
					sap.ui.core.BusyIndicator.hide();
					that.messageError(that, xhr.responseText);
					return;
				},
				complete: function (xhr, status) {
					sap.ui.core.BusyIndicator.hide();
					var oCausaliModel = getCausaliModel(that);
					if (!that._oDialog) {
						Fragment.load({
							id: "fragmentCOM4",
							name: "it.greenorange.mes.view.COM4",
							controller: that
						}).then(function (oDialog) {
							that._oDialog = oDialog;
							that._oDialog.setModel(oCausaliModel);
							oView.addDependent(that._oDialog);
							_endgetCausali(that, viewModel);
						}.bind(that));
					} else {
						_endgetCausali(that, viewModel);
					}
				}
			});

			function _endgetCausali(that, viewModel) {
				that._oDialog.open();
				that.onRefresh(viewModel);
			};

			function getCausaliModel(that) {
				var oArray = that.getView().getModel().getData();
				var parser = new DOMParser();
				var xmlDoc = parser.parseFromString(response, "text/xml");
				var returnVal = xmlDoc.getElementsByTagName("getCausali")[0].childNodes[0].nodeValue;
				var oData = $.parseJSON(returnVal);
				if (oData.response.Status !== 200) {
					var msgError = !!that.getView().$().closest(".sapUiSizeCompact").length;
					MessageBox.error(
						oData.response.Message, {
							styleClass: msgError ? "sapUiSizeCompact" : ""
						}
					);
				} else {
					MessageToast.show(oData.response.Message, {
						duration: 2000
					});
				}
				oData.itemSelected = itemSelected;
				for (var i = 0; i < oData.causali.length; i++) {
					var causale = oData.causali[i];
					causale.notecausali = "";
					causale.noteazioni = "";
					if (causale.azione === true) {
						causale.azioni = [];
						causale.azioneSelected = "";
						for (var j = 0; j < oData.azioni.length; j++) {
							var azione = oData.azioni[j];
							if (causale.chiave === azione.chiaveCausale || azione.chiaveCausale === "") {
								causale.azioni[j] = azione;
								oModel.setData(oData);
							}
						}
					} else {
						oModel.setData(oData);
					}
				}
				return oModel;
			};
		},

		onAzioniChange: function (oEvent) {
			var that = this;
			var oModelCOM4 = that._oDialog.getModel();
			var path = oEvent.getSource().getBindingContext().sPath;
			var idx = path.substr(-1)
			var oValidatedComboBox = oEvent.getSource(),
				sSelectedKey = oValidatedComboBox.getSelectedKey(),
				sValue = oValidatedComboBox.getValue();
			oModelCOM4.oData.causali[idx].azioneSelected = sSelectedKey;
			if (!sSelectedKey && sValue) {
				oValidatedComboBox.setValueState("Warning");
			} else {
				oValidatedComboBox.setValueState("Success");
			}
		},

		onConfirmCOM4: function (oEvent) {
			var that = this;
			var request = "";
			var response = "";
			var cid = "";
			var oData = this.getView().getModel().getData();
			var oModel = new sap.ui.model.json.JSONModel();
			var oView = that.getView();
			var oModelCOM4 = that._oDialog.getModel();
			var aItems = Fragment.byId("fragmentCOM4", "tblCausali")._aSelectedPaths;
			var buttonPressed = oEvent.getSource().getText();
			var confirmIsPressed = buttonPressed === "Conferma" ? true : false;
			if (aItems.length || !confirmIsPressed) {
				var ordine = "";
				var operazione = "";
				var operatore = "";
				var ipmacchinario = "";
				for (var i = 0; i < oData.impianti.length; i++) {
					var row = oData.impianti[i];
					if (row.impianto === itemSelected) {
						ordine = row.ordine;
						operazione = row.operazione;
						operatore = row.cid;
						ipmacchinario = row.ipMacchinario;
						break;
					}
				}
				var causale, notecausali, azione, noteazioni, getUrl;
				if (confirmIsPressed) {
					for (var i = 0; i < aItems.length; i++) {
						var idx = aItems[i].substring(aItems[i].lastIndexOf("/") + 1);
						causale = oModelCOM4.oData.causali[idx].chiave;
						notecausali = oModelCOM4.oData.causali[idx].notecausali;
						azione = "";
						noteazioni = "";
						if (typeof oModelCOM4.oData.causali[idx].azioneSelected !== "undefined" && oModelCOM4.oData.causali[idx].azioneSelected !==
							null) {
							azione = oModelCOM4.oData.causali[idx].azioneSelected;
							noteazioni = oModelCOM4.oData.causali[idx].noteazioni;
						}
						getUrl = "/MOROCOLOR_HUB/com4?ordine='" + ordine + "'&operazione='" + operazione +
							"'&operatore='" + operatore + "'&ipmacchinario='" + ipmacchinario + "'&causale='" + causale + "'&azione='" + azione +
							"'&notecausali='" + notecausali + "'&noteazioni='" + noteazioni + "'";
						sendCOM4(that, getUrl);
					}
				} else {
					// si entra qui dentro quando si clicca il Cancella del pop up causali per inviare una sospensione causata dall'IOT
					causale = "SIOT";
					notecausali = "";
					azione = "";
					noteazioni = "";
					getUrl = "/MOROCOLOR_HUB/com4?ordine='" + ordine + "'&operazione='" + operazione +
						"'&operatore='" + operatore + "'&ipmacchinario='" + ipmacchinario + "'&causale='" + causale + "'&azione='" + azione +
						"'&notecausali='" + notecausali + "'&noteazioni='" + noteazioni + "'";
					sendCOM4(that, getUrl);
				}
			} else {
				MessageToast.show("Non è stato selezionato alcun elemento");
				return;
			}
			oEvent.getSource().getBinding("items").filter([]);

			function sendCOM4(that, getUrl) {
				sap.ui.core.BusyIndicator.show();
				$.ajax({
					url: getUrl,
					type: "POST",
					data: request,
					dataType: "text",
					contentType: "application/x-www-form-urlencoded",
					success: function (data, textStatus, jqXHR) {
						sap.ui.core.BusyIndicator.hide();
						response = data;
					},
					error: function (xhr, status) {
						sap.ui.core.BusyIndicator.hide();
						that.messageError(that, xhr.responseText);
						return;
					},
					complete: function (xhr, status) {
						sap.ui.core.BusyIndicator.hide();
						oView.setModel(getCom4Model(that));
						if (that._oDialog) {
							that._oDialog.destroy();
							that._oDialog = undefined;
						}
					}
				});
			}

			function getCom4Model(that) {
				var oArray = that.getView().getModel().getData();
				var parser = new DOMParser();
				var xmlDoc = parser.parseFromString(response, "text/xml");
				var returnVal = xmlDoc.getElementsByTagName("com4")[0].childNodes[0].nodeValue;
				var oData = $.parseJSON(returnVal);
				if (oData.response.Status !== 200) {
					var msgError = !!that.getView().$().closest(".sapUiSizeCompact").length;
					MessageBox.error(
						oData.response.Message, {
							styleClass: msgError ? "sapUiSizeCompact" : ""
						}
					);
				} else {
					MessageToast.show(oData.response.Message, {
						duration: 2000
					});
				}
				for (var i = 0; i < oArray.impianti.length; i++) {
					var row = oArray.impianti[i];
					if (row.impianto === itemSelected) {
						row.centroDiLavoro = oData.impianto.centroDiLavoro;
						row.chiaveComando = oData.impianto.operazioni.length ? oData.impianto.operazioni[0].chiaveComando : "";
						row.statoMacchinario = oData.impianto.statoMacchinario;
						if (row.statoMacchinario === "SOSP") {
							row.icon = "sap-icon://alert";
						} else {
							row.icon = "sap-icon://instance";
						}
						row.operazioni = that._setOperazioniOrder(oData.impianto.operazioni);
						row.login = "true";
						for (var j = 0; j < row.operazioni.length; j++) {
							if (row.operazioni[j].statoOperazione === "EXEC" && row.operazioni[j].ipMacchinarioExec === ipMacchinarioSelected) {
								row.operazioni[j].statoOperazioneEnh = "EXEC"
							} else if (row.operazioni[j].statoOperazione === "EXEC" && row.operazioni[j].ipMacchinarioExec != ipMacchinarioSelected) {
								row.operazioni[j].statoOperazioneEnh = "EXET"
							} else {
								row.operazioni[j].statoOperazioneEnh = row.operazioni[j].statoOperazione;
							}
						}
						oModel.setData(oArray);
						oModel.updateBindings();
					}
				}
				return oModel;
			}
		},

		onRemoveCOM4: function (fromSocket) {
			var that = this;
			var request = "";
			var response = "";
			var cid = "";
			var oData = this.getView().getModel().getData();
			var oModel = new sap.ui.model.json.JSONModel();
			var oView = this.getView();
			var ordine = "";
			var operazione = "";
			var operatore = "";
			var ipmacchinario = "";
			var row = _.find(oData.impianti, {
				impianto: itemSelected
			});
			ordine = row.ordine;
			operazione = row.operazione;
			operatore = row.cid;
			ipmacchinario = row.ipMacchinario;
			if (row.stoppedMeasure) {
				delete(row.stoppedMeasure);
			}

			var getUrl = "/MOROCOLOR_HUB/com4?ordine='" + ordine + "'&operazione='" + operazione +
				"'&operatore='" + operatore + "'&ipmacchinario='" + ipmacchinario + "'&causale='FINE'";
			sendCOM4(that, getUrl);

			if (this._oDialog) {
				this._oDialog.destroy();
				this._oDialog = undefined;
			}

			function sendCOM4(that, getUrl) {
				sap.ui.core.BusyIndicator.show();
				$.ajax({
					url: getUrl,
					type: "POST",
					data: request,
					dataType: "text",
					contentType: "application/x-www-form-urlencoded",
					success: function (data, textStatus, jqXHR) {
						sap.ui.core.BusyIndicator.hide();
						response = data;
					},
					error: function (xhr, status) {
						sap.ui.core.BusyIndicator.hide();
						that.messageError(that, xhr.responseText);
						return;
					},
					complete: function (xhr, status) {
						sap.ui.core.BusyIndicator.hide();
						oView.setModel(getCom4Model(that));
						if (typeof (fromSocket) === "boolean") {
							that.handleConfirmpreCOM1();
						}
					}.bind(this)
				});
			}

			function getCom4Model(that) {
				var oArray = that.getView().getModel().getData();
				var parser = new DOMParser();
				var xmlDoc = parser.parseFromString(response, "text/xml");
				var returnVal = xmlDoc.getElementsByTagName("com4")[0].childNodes[0].nodeValue;
				var oData = $.parseJSON(returnVal);
				if (oData.response.Status !== 200) {
					var msgError = !!that.getView().$().closest(".sapUiSizeCompact").length;
					MessageBox.error(
						oData.response.Message, {
							styleClass: msgError ? "sapUiSizeCompact" : ""
						}
					);
				} else {
					MessageToast.show(oData.response.Message, {
						duration: 2000
					});
				}

				for (var i = 0; i < oArray.impianti.length; i++) {
					var row = oArray.impianti[i];
					if (row.impianto === itemSelected) {
						row.centroDiLavoro = oData.impianto.centroDiLavoro;
						row.chiaveComando = oData.impianto.operazioni.length ? oData.impianto.operazioni[0].chiaveComando : "";
						row.statoMacchinario = oData.impianto.statoMacchinario;
						if (row.statoMacchinario === "SOSP") {
							row.icon = "sap-icon://alert";
						} else {
							row.icon = "sap-icon://instance";
						}
						row.operazioni = that._setOperazioniOrder(oData.impianto.operazioni);
						row.login = "true";
						for (var j = 0; j < row.operazioni.length; j++) {
							if (row.operazioni[j].statoOperazione === "EXEC" && row.operazioni[j].ipMacchinarioExec === ipMacchinarioSelected) {
								row.operazioni[j].statoOperazioneEnh = "EXEC"
							} else if (row.operazioni[j].statoOperazione === "EXEC" && row.operazioni[j].ipMacchinarioExec != ipMacchinarioSelected) {
								row.operazioni[j].statoOperazioneEnh = "EXET"
							} else {
								row.operazioni[j].statoOperazioneEnh = row.operazioni[j].statoOperazione;
							}
						}
						oModel.setData(oArray);
					}
				}
				return oModel;
			}
		},

		/*-- SOSP	COM4	CAUSALE SOSPENSIONE(Tab L3)	Fermo Impianto (Spec. Causale) --*/
		/*-- PP01	COM4emezzo	DICHIARAZIONE DI PRODUZIONE/AVANZAMENTO Versamenti di Produzione o Avanzamento --*/
		handleCommandCOM4emezzo: function (oEvent) {
			sap.ui.core.BusyIndicator.show();
			var that = this;
			var oView = that.getView();
			var request = "";
			var response = "";
			var ret = false;
			var oOperazioneModel = "";
			var ordine = "";
			var operazione = "";
			var enableBancali = false;
			var oModel = new sap.ui.model.json.JSONModel();
			var oArray = that.getView().getModel().getData();
			for (var i = 0; i < oArray.impianti.length; i++) {
				var row = oArray.impianti[i];
				if (row.impianto === itemSelected) {
					for (var j = 0; j < row.operazioni.length; j++) {
						if (row.operazioni[j].statoOperazione === "EXEC" && row.operazioni[j].ipMacchinarioExec === ipMacchinarioSelected) {
							oOperazioneModel = row.operazioni[j];
							oOperazioneModel.scarto = "0";
							oOperazioneModel.pf = "";
							oOperazioneModel.completo = false;
							oOperazioneModel.single = "false";
							oOperazioneModel.idBancale = "";
							oOperazioneModel.bancaleCompleto = false;
							oOperazioneModel.ipMacchinario = row.ipMacchinario;
							oOperazioneModel.idsessione = row.idsessione;
							oOperazioneModel.cid = row.operatori.accettati;
							oOperazioneModel.bancali = row.bancali;
							oModel.setData(oOperazioneModel);
						}
					}
					ordine = row.ordine;
					operazione = row.operazione;
					enableBancali = row.bancali;
				}
			}
			if (oOperazioneModel === "") {
				var msgleader = !!that.getView().$().closest(".sapUiSizeCompact").length;
				MessageBox.error(
					"Selezionare un'operazione!", {
						styleClass: msgleader ? "sapUiSizeCompact" : ""
					}
				);
				sap.ui.core.BusyIndicator.hide();
				return;
			}
			getUrl = "/MOROCOLOR_HUB/getBancali" +
				"?ipmacchinario='" + oOperazioneModel.ipMacchinario + "'";
			sap.ui.core.BusyIndicator.show();
			$.ajax({
				url: getUrl,
				type: "GET",
				data: request,
				dataType: "text",
				contentType: "application/x-www-form-urlencoded",
				success: function (data, textStatus, jqXHR) {
					sap.ui.core.BusyIndicator.hide();
					response = data;
				},
				error: function (xhr, status) {
					sap.ui.core.BusyIndicator.hide();
					that.messageError(that, xhr.responseText);
					return;
				},
				complete: function (xhr, status) {
					sap.ui.core.BusyIndicator.hide();
					var oBancaliModel = getBancaliModelForAvanzamento(response, that, enableBancali);
					if (!that._oDialog) {
						Fragment.load({
							id: "fragmentNavCon",
							name: "it.greenorange.mes.view.COM4emezzo",
							controller: that
						}).then(function (oDialog) {
							that._oDialog = oDialog;
							that._oDialog.setModel(oBancaliModel);
							that._oDialog.getModel().setProperty("/SelectedIndices", []);
							oView.addDependent(that._oDialog);
							that._oDialog.open();
						}.bind(that));
					} else {
						that._oDialog.open();
					}
				}
			});

			function getBancaliModelForAvanzamento(response, that, enableBancali) {
				var parser = new DOMParser();
				var xmlDoc = parser.parseFromString(response, "text/xml");
				var returnVal = xmlDoc.getElementsByTagName("getBancali")[0].childNodes[0].nodeValue;
				var oData = $.parseJSON(returnVal);
				if (oData.response.Status !== 200) {
					var msgError = !!that.getView().$().closest(".sapUiSizeCompact").length;
					MessageBox.error(
						oData.response.Message, {
							styleClass: msgError ? "sapUiSizeCompact" : ""
						}
					);
				} else {
					MessageToast.show(oData.response.Message, {
						duration: 2000
					});
				}
				var tmonth = new Array("01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12");
				var d = new Date();
				var nmonth = d.getMonth(),
					ndate = d.getDate(),
					nyear = d.getYear();
				if (nyear < 1000) nyear += 1900;
				var today = nyear + "-" + tmonth[nmonth] + "-" + ndate;
				var oNew =
					"{\"idBancale\": \"NUOVO\",\"dataCreazione\": \"" + today +
					"\",\"versamenti\": [{\"descrizioneArticolo\": \"\",\"quantita\": 0.0,\"quantitaColli\": 0.0}]}";
				var oDataNew = $.parseJSON(oNew);
				oData.bancali.push(oDataNew);
				for (var i = 0; i < oData.bancali.length; i++) {
					oData.bancali[i].bancaleCompleto = false;
				}
				var i = returnVal.search("bancali");
				var oRaw = "{" + returnVal.substring(i - 1);
				var oNuovo;
				if (enableBancali) {
					oNuovo =
						"{\"bancali\":[{\"idBancale\": \"NUOVO\",\"dataCreazione\": \"2020-01-01\",\"versamenti\": [{\"descrizioneArticolo\": \"\",\"quantita\": 0.0,\"quantitaColli\": 0.0}]}, ";
					if (returnVal === "{\"response\":{\"Status\":200,\"Message\":\"Bancali estratti!\"},\"bancali\":[]}") {
						oNuovo =
							"{\"bancali\":[{\"idBancale\": \"NUOVO\",\"dataCreazione\": \"2020-01-01\",\"versamenti\": [{\"descrizioneArticolo\": \"\",\"quantita\": 0.0,\"quantitaColli\": 0.0}]}";
					}
					var oSubst = "{\"bancali\":["
					oRaw = oRaw.replace(oSubst, oNuovo);
					oSubst = "\"dataCreazione\"";
					oNuovo = "\"bancaleCompleto\": false,\"dataCreazione\"";
					oRaw = oRaw.replace(oSubst, oNuovo);
				}
				oData = $.parseJSON(oRaw);
				var bancali = that._getBancaliData(oData.bancali);
				oData.bancali = bancali
				oModel.setProperty("/bancaliList", oData);
				return oModel;
			}
		},

		onNavToVersamentiCOM4emezzo: function (oEvent) {
			var oBindingObject = oEvent.getParameter("listItem").getBindingContext().getObject();
			var oModel = new sap.ui.model.json.JSONModel();
			oModel.setData(oBindingObject);
			var dialogModel = this._oDialog.getModel();
			dialogModel.setProperty("/idBancale", oBindingObject.idBancale);
			this._oDialog.focus();
			var oNavCon = Fragment.byId("fragmentNavCon", "navCon1");
			var oDetailPage = Fragment.byId("fragmentNavCon", "detail1");
			oDetailPage.setModel(oModel);
			oNavCon.to(oDetailPage);
		},

		onNavBackVersamentiCOM4emezzo: function (oEvent) {
			var oNavCon = Fragment.byId("fragmentNavCon", "navCon1");
			oNavCon.back();
			this._oDialog.focus();
			var dialogModel = this._oDialog.getModel();
			dialogModel.setProperty("/idBancale", "");
		},

		onNavToCOM4emezzo: function (oEvent) {
			var completoCheck = Fragment.byId("fragmentNavCon", "chk_clo");
			var completo = completoCheck.getSelected();
			var cid = Fragment.byId("fragmentNavCon", "cid").getSelectedKey();
			var idBancale = Fragment.byId("fragmentNavCon", "tblBancali")._aSelectedPaths
			var oData = this.getView().getModel().getData();
			var oModel = new sap.ui.model.json.JSONModel();
			var oView = this.getView();
			var oModelCOM4emezzo = this._oDialog.getModel();
			var oView = this.getView();
			if (!oModelCOM4emezzo.oData.pf || !parseFloat(oModelCOM4emezzo.oData.pf)) {
				this.handleWarningMessageBoxPress("Inserire una quantità!");
				return;
			}
			if (oModelCOM4emezzo.oData.bancali && typeof idBancale[0] === "undefined") {
				this.handleWarningMessageBoxPress("Selezionare un Bancale!");
				return;
			}
			if (oModelCOM4emezzo.oData.bancali) {
				idBancale = idBancale[0].substring(idBancale[0].lastIndexOf("/") + 1);
				oModelCOM4emezzo.oData.idBancale = oModelCOM4emezzo.oData.bancaliList.bancali[idBancale].idBancale
				if (oModelCOM4emezzo.oData.bancaliList.bancali[idBancale].bancaleCompleto !== true) {
					oModelCOM4emezzo.oData.bancaleCompleto = false;
				} else {
					oModelCOM4emezzo.oData.bancaleCompleto = oModelCOM4emezzo.oData.bancaliList.bancali[idBancale].bancaleCompleto;
				}
			}
			var qtaMaxToFill;
			if (oModelCOM4emezzo.oData.quantitaMassima) {
				qtaMaxToFill = oModelCOM4emezzo.oData.quantitaMassima - (oModelCOM4emezzo.oData.quantitaRichiesta - oModelCOM4emezzo.oData.quantitaResiduadaVersare);
			}
			if (!completo && parseFloat(oModelCOM4emezzo.oData.pf) >= oModelCOM4emezzo.oData.quantitaResiduadaVersare) {
				completo = true;
			}
			var message = "";
			if (oModelCOM4emezzo.oData.quantitaMassima && completo && parseFloat(oModelCOM4emezzo.oData.pf) > qtaMaxToFill) {
				message = "Attenzione superati limiti di tolleranza prefissati!\nQuantità massima: " + qtaMaxToFill + "\nQuantità inserita: " +
					oModelCOM4emezzo.oData.pf;
			} else if (oModelCOM4emezzo.oData.quantitaMinima && completo && parseFloat(oModelCOM4emezzo.oData.pf) < oModelCOM4emezzo.oData.quantitaMinima) {
				message = "Attenzione superati limiti di tolleranza prefissati!\nQuantità minima: " + oModelCOM4emezzo.oData.quantitaMinima +
					"\nQuantità inserita: " + oModelCOM4emezzo.oData.pf;
			}
			if (message) {
				this.confirmWarningMessageBoxPress(message, completo, completoCheck);
			} else {
				this.continueNavToCom4emezzo(completo, completoCheck);
			}
		},

		onCopyComponentCOM4emezzo: function (oEvent) {
			var oModel = new sap.ui.model.json.JSONModel();
			var oData = this._oDialog.getModel().getData();
			var sPath = oEvent.getSource().getBindingContext().getPath();
			var idx = sPath.substring(sPath.lastIndexOf("/") + 1);
			oModel = this._oDialog.getModel();
			var oRowData = this._oDialog.getModel().getProperty(sPath);
			var newRowData = {
				um: oRowData.um,
				componente: oRowData.componente,
				descrizioneComponente: oRowData.descrizioneComponente,
				consumoConfermato: "",
				consumoTeorico: oRowData.consumoTeorico,
				lotto: "",
				lotti: oRowData.lotti,
				scarto: oRowData.scarto,
				copied: true,
				selected: true,
				obbligoLotto: oRowData.obbligoLotto
			};
			oData.componenti.push(newRowData);
			oModel.setData(oData);
			oModel.updateBindings();
		},

		onDeleteComponentCOM4emezzo: function (oEvent) {
			var oModel = new sap.ui.model.json.JSONModel();
			var oData = this._oDialog.getModel().getData();
			var sPath = oEvent.getSource().getBindingContext().getPath();
			var idx = sPath.substring(sPath.lastIndexOf("/") + 1);
			oModel = this._oDialog.getModel();
			oData.componenti.splice(idx, 1);
			oModel.setData(oData);
			oModel.updateBindings();
		},

		handleWarningMessageBoxPress: function (message) {
			var bCompact = !!this.getView().$().closest(".sapUiSizeCompact").length;
			MessageBox.warning(
				message, {
					styleClass: bCompact ? "sapUiSizeCompact" : ""
				}
			);
		},

		confirmWarningMessageBoxPress: function (message, completo, completoCheck) {
			var messageModel = new sap.ui.model.json.JSONModel();
			messageModel.setData({
				message: message,
				completo: completo,
				completoCheck: completoCheck
			});
			var oDialog = new sap.m.Dialog({
				title: "Attenzione",
				styleClass: "sapUiSizeCompact",
				content: new sap.m.Text({
					text: "{/message}",
					styleClass: "sapUiTinyMargin"
				}),
				buttons: [
					new sap.m.Button({
						text: "Rivedi",
						press: _.bind(this.onRivediPress, this),
						type: "Emphasized",
						width: "5rem"
					}),
					new sap.m.Button({
						text: "Prosegui",
						press: _.bind(this.onProseguiPress, this),
						type: "Reject",
						width: "5rem"
					}),
				]
			});
			oDialog.addStyleClass("sapUiSizeCompact");
			oDialog.getContent()[0].addStyleClass("sapUiTinyMargin");
			oDialog.setModel(messageModel);
			this.getView().addDependent(oDialog);
			this._checkObbligatorietaMessage = oDialog;
			this._checkObbligatorietaMessage.open();
		},

		onRivediPress: function () {
			this._checkObbligatorietaMessage.close();
		},

		onProseguiPress: function () {
			this._checkObbligatorietaMessage.close();
			var model = this._checkObbligatorietaMessage.getModel();
			this.continueNavToCom4emezzo(model.completo, model.completoCheck);
		},

		continueNavToCom4emezzo: function (completo, completoCheck) {
			var that = this;
			var response = "";
			var oModelCOM4emezzo = this._oDialog.getModel();
			if (completo && !completoCheck.getSelected()) {
				// entro qui dentro se l'utente non ha selezionato il flag di "Completo" però l'interfaccia riconosce che dovrebbe essere inserito
				completoCheck.setSelected(true);
				completoCheck.rerender();
			}
			for (var k = 0; k < oModelCOM4emezzo.oData.componenti.length; k++) {
				oModelCOM4emezzo.oData.componenti[k].consumoConfermato = oModelCOM4emezzo.oData.componenti[k].consumoTeorico * oModelCOM4emezzo.oData
					.pf /
					oModelCOM4emezzo.oData.quantitaRichiesta;
				oModelCOM4emezzo.oData.componenti[k].consumoConfermato = Math.round(oModelCOM4emezzo.oData.componenti[k].consumoConfermato);
				oModelCOM4emezzo.oData.componenti[k].scarto = "0";
				oModelCOM4emezzo.oData.componenti[k].copied = false;
				oModelCOM4emezzo.oData.componenti[k].newLotto = oModelCOM4emezzo.oData.componenti[k].lotto;
			}
			/****************************************************************************************************/
			var versfin = false;
			if (completo || (!completo && parseFloat(oModelCOM4emezzo.oData.pf) >= oModelCOM4emezzo.oData.quantitaResiduadaVersare)) {
				versfin = true;
			}
			getUrl = "/MOROCOLOR_HUB/checkObbligatorieta" +
				"?ordine='" + oModelCOM4emezzo.oData.ordine + "'&operazione='" + oModelCOM4emezzo.oData.operazione + "'&versfin=" + versfin;
			sap.ui.core.BusyIndicator.show();
			$.ajax({
				url: getUrl,
				type: "GET",
				data: "",
				dataType: "text",
				contentType: "application/x-www-form-urlencoded",
				success: function (data, textStatus, jqXHR) {
					response = data;
				},
				error: function (xhr, status) {
					sap.ui.core.BusyIndicator.hide();
					that.messageError(that, xhr.responseText);
					return false;
				},
				complete: function (xhr, status) {
					var ret = getCheckObbligatorietaModel(that);
					if (ret) {
						var fromMethod = "com4eMezzo";
						that.onRefresh(oModelCOM4emezzo, fromMethod);
					} else {
						sap.ui.core.BusyIndicator.hide();
					}
				}
			});

			function getCheckObbligatorietaModel() {
				var parser = new DOMParser();
				var xmlDoc = parser.parseFromString(response, "text/xml");
				var returnVal = xmlDoc.getElementsByTagName("checkObbligatorieta")[0].childNodes[0].nodeValue;
				var oData = $.parseJSON(returnVal);
				if (oData.response.Status !== 200) {
					var msgError = !!that.getView().$().closest(".sapUiSizeCompact").length;
					var msg = oData.response.Message + oData.controlli;
					msg = msg.replace("!", '!\n\n');
					msg = msg.replace(",", "\n").replace(",", "\n").replace(",", "\n").replace(",", "\n");
					MessageBox.error(
						msg, {
							styleClass: msgError ? "sapUiSizeCompact" : ""
						}
					);
					return false;
				} else {
					return true;
				}
			}
		},

		onNavBack: function (oEvent) {
			var oNavCon = Fragment.byId("fragmentNavCon", "navCon");
			oNavCon.back();
			this._oDialog.focus();
		},

		onConfirmCOM5: function (oEvent) {
			var that = this;
			var request = "";
			var response = "";
			var completo = Fragment.byId("fragmentNavCon", "chk_clo").getSelected();
			var cid = Fragment.byId("fragmentNavCon", "cid").getSelectedKey();
			var oData = this.getView().getModel().getData();
			var oModel = new sap.ui.model.json.JSONModel();
			var oView = this.getView();
			var oModelCOM4emezzo = that._oDialog.getModel();
			var dataModel = oModelCOM4emezzo.getData();
			var oView = this.getView();
			if (this._oDialog) {
				this._oDialog.destroy();
				this._oDialog = undefined;
			}
			var idbancale = "";
			var bancaleCompleto = false;
			if (typeof (dataModel.idBancale) !== "undefined" && typeof (dataModel.bancaleCompleto) !== "undefined") {
				idbancale = dataModel.idBancale;
				bancaleCompleto = dataModel.bancaleCompleto;
			}
			var noteazioni = "";
			if (typeof (dataModel.noteazioni) !== "undefined" && dataModel.noteazioni) {
				noteazioni = dataModel.noteazioni;
			}
			var scartoToSend = !dataModel.scarto ? 0 : parseFloat(dataModel.scarto);
			if (!idbancale) {
				var getUrl = "/MOROCOLOR_HUB/com5?" +
					"ordine='" + dataModel.ordine +
					"'&operazione='" + dataModel.operazione +
					"'&ipmacchinario='" + dataModel.ipMacchinario +
					"'&cid='" + cid +
					"'&completo=" + completo +
					"&pf=" + dataModel.pf +
					"&scarto=" + scartoToSend +
					"&noteazioni='" + noteazioni +
					"'&idsessione='" + dataModel.idsessione + "'";
			} else {
				var getUrl = "/MOROCOLOR_HUB/com5?" +
					"ordine='" + dataModel.ordine +
					"'&operazione='" + dataModel.operazione +
					"'&ipmacchinario='" + dataModel.ipMacchinario +
					"'&cid='" + cid +
					"'&completo=" + completo +
					"&pf=" + dataModel.pf +
					"&scarto=" + scartoToSend +
					"&noteazioni='" + noteazioni +
					"'&idsessione='" + dataModel.idsessione +
					"'&idbancale='" + idbancale +
					"'&bancaleCompleto=" + bancaleCompleto;
			}
			sendCOM4emezzo(that, getUrl);

			function sendCOM4emezzo(that, getUrl) {
				sap.ui.core.BusyIndicator.show();
				$.ajax({
					url: getUrl,
					type: "POST",
					data: request,
					dataType: "text",
					contentType: "application/x-www-form-urlencoded",
					success: function (data, textStatus, jqXHR) {
						sap.ui.core.BusyIndicator.hide();
						response = data;
					},
					error: function (xhr, status) {
						sap.ui.core.BusyIndicator.hide();
						that.messageError(that, xhr.responseText);
						return;
					},
					complete: function (xhr, status) {
						sap.ui.core.BusyIndicator.hide();
						oView.setModel(getCom5Model(that));
						operationSelected = "";
					}
				});
			}

			function getCom5Model(that) {
				var oArray = that.getView().getModel().getData();
				var parser = new DOMParser();
				var xmlDoc = parser.parseFromString(response, "text/xml");
				var returnVal = xmlDoc.getElementsByTagName("com5")[0].childNodes[0].nodeValue;
				var oData = $.parseJSON(returnVal);
				if (oData.response.Status !== 200) {
					var msgleader = !!that.getView().$().closest(".sapUiSizeCompact").length;
					MessageBox.error(
						oData.response.Message, {
							styleClass: msgleader ? "sapUiSizeCompact" : ""
						}
					);
				} else {
					MessageToast.show(oData.response.Message, {
						duration: 500
					});
				}
				for (var i = 0; i < oArray.impianti.length; i++) {
					var row = oArray.impianti[i];
					if (row.impianto === itemSelected) {
						row.centroDiLavoro = oData.impianto.centroDiLavoro;
						row.chiaveComando = oData.impianto.operazioni.length ? oData.impianto.operazioni[0].chiaveComando : "";
						row.statoMacchinario = oData.impianto.statoMacchinario;
						if (row.statoMacchinario === "SOSP") {
							row.icon = "sap-icon://alert";
						} else {
							row.icon = "sap-icon://instance";
						}
						row.operazioni = that._setOperazioniOrder(oData.impianto.operazioni);
						row.login = "true";
						for (var j = 0; j < row.operazioni.length; j++) {
							if (row.operazioni[j].statoOperazione === "EXEC" && row.operazioni[j].ipMacchinarioExec === ipMacchinarioSelected) {
								row.operazioni[j].statoOperazioneEnh = "EXEC"
							} else if (row.operazioni[j].statoOperazione === "EXEC" && row.operazioni[j].ipMacchinarioExec != ipMacchinarioSelected) {
								row.operazioni[j].statoOperazioneEnh = "EXET"
							} else {
								row.operazioni[j].statoOperazioneEnh = row.operazioni[j].statoOperazione;
							}
						}
						oModel.setData(oArray);
					}
				}
				return oModel;
			}
		},

		messageError: function (that, message) {
			var msgleader = !!that.getView().$().closest(".sapUiSizeCompact").length;
			MessageBox.error(
				message, {
					styleClass: msgleader ? "sapUiSizeCompact" : ""
				}
			);
		},

		onToggleOpenState: function (oEvent) {
			var that = this;
			var iItemIndex = oEvent.getParameter("itemIndex");
			var oItemContext = oEvent.getParameter("itemContext");
			var bExpanded = oEvent.getParameter("expanded");
			MessageToast.show("Item index: " + iItemIndex + "\nItem context (path): " + oItemContext + "\nExpanded: " + bExpanded, {
				duration: 5000,
				width: "auto"
			});
			var oTree = this.byId("Tree");
			var oModel = this.getView().getModel();
			var sPath = oItemContext.getPath();
			var bChildIsDummyNode = oModel.getProperty(sPath + "/nodes/0").dummy === true;
		},

		handleCommandCOM6: function (oEvent) {
			var that = this;
			var oView = that.getView();
			var request = "";
			var response = "";
			var operazione = "";
			var oOperazioneModel = "";
			var oModel = new sap.ui.model.json.JSONModel();
			var oArray = that.getView().getModel().getData();
			for (var i = 0; i < oArray.impianti.length; i++) {
				var row = oArray.impianti[i];
				if (row.impianto === itemSelected) {
					for (var j = 0; j < row.operazioni.length; j++) {
						if (row.operazioni[j].statoOperazione === "EXEC" && row.operazioni[j].ipMacchinarioExec === ipMacchinarioSelected) {
							oOperazioneModel = row.operazioni[j];
							oOperazioneModel.confTeor = row.confTeor;
							oOperazioneModel.scarto = "";
							oOperazioneModel.completo = "true";
							oOperazioneModel.ipMacchinario = row.ipMacchinario;
							oOperazioneModel.idsessione = row.idsessione;
							oOperazioneModel.single = "true";
							for (var k = 0; k < row.operazioni[j].componenti.length; k++) {
								oOperazioneModel.componenti[k].scarto = "";
								oOperazioneModel.componenti[k].lotto = "";
								if (row.confTeor) {
									oOperazioneModel.componenti[k].consumoConfermato = "0";
									oOperazioneModel.componenti[k].copied = false;
									oOperazioneModel.componenti[k].newLotto = "";
								}
							}
							oModel.setData(oOperazioneModel);
						}
					}
				}
			}
			if (!oOperazioneModel) {
				var msgleader = !!that.getView().$().closest(".sapUiSizeCompact").length;
				MessageBox.error(
					"Selezionare un'operazione!", {
						styleClass: msgleader ? "sapUiSizeCompact" : ""
					}
				);
				return;
			}
			if (!that._oDialog) {
				Fragment.load({
					id: "fragmentNavCon",
					name: "it.greenorange.mes.view.COM6",
					controller: that
				}).then(function (oDialog) {
					that._oDialog = oDialog;
					that._oDialog.setModel(oModel);
					oView.addDependent(that._oDialog);
					that._oDialog.open();
				}.bind(that));
			} else {
				that._oDialog.open();
			}
		},

		onSelectionChangeCOM4emezzo: function (oEvent) {
			var oYourTable = this.getView().byId("tblBancali"),
				iSelectedIndex = oEvent.getSource().getSelectedIndex();
			oYourTable.setSelectedIndex(iSelectedIndex);
		},

		onLottoChange: function (oEvent) {
			var that = this;
			var oModelCOM4emezzo = that._oDialog.getModel();
			var path = oEvent.getSource().getBindingContext().sPath;
			var idx = path.substr(-1)
			var oValidatedComboBox = oEvent.getSource(),
				sSelectedKey = oValidatedComboBox.getSelectedKey(),
				sValue = oValidatedComboBox.getValue();
			oModelCOM4emezzo.oData.componenti[idx].newLotto = sValue;
			if (!sSelectedKey && sValue) {
				oValidatedComboBox.setValueState("Warning");
			} else {
				oValidatedComboBox.setValueState("Success");
			}
		},

		onConfirmCOM6Press: function () {
			var componenti = this._oDialog.getModel().getProperty("/componenti");
			var nullRow = _.find(componenti, function (n) {
				if (n.selected && !parseFloat(n.scarto)) {
					return n;
				}
			});
			if (nullRow) {
				MessageBox.error(
					"Inserire una quantità di scarto per la componente " + nullRow.componente + "!", {
						styleClass: "sapUiSizeCompact"
					}
				);
			} else {
				_.forEach(componenti, function (n) {
					if (n.selected) {
						n.newLotto = n.lotto;
					}
				});
				this.onConfirmCOM4emezzo();
			}
		},

		onConfirmCOM4emezzo: function () {
			var that = this;
			var oModelCOM4emezzo = that._oDialog.getModel();
			// verifico che non ci siano righe selezionate con quantità = 0
			var nullSplitRow = _.find(oModelCOM4emezzo.getProperty("/componenti"), function (n) {
				if (n.selected && n.copied && !parseFloat(n.consumoConfermato)) {
					return n;
				}
			});
			if (nullSplitRow) {
				MessageBox.error(
					"Inserire una quantità per la componente " + nullSplitRow.componente + " appena copiata!", {
						styleClass: "sapUiSizeCompact"
					}
				);
				return;
			}
			var request = "";
			var response = "";
			var oView = that.getView();
			var oData = that.getView().getModel().getData();
			var oModel = new sap.ui.model.json.JSONModel();
			var aItems = Fragment.byId("fragmentNavCon", "tblComponents")._aSelectedPaths;
			sap.ui.core.BusyIndicator.show();
			for (var i = 0; i < aItems.length; i++) {
				var idx = aItems[i].substring(aItems[i].lastIndexOf("/") + 1);
				var componentToSend = oModelCOM4emezzo.oData.componenti[idx];
				if (componentToSend) {
					var lottoToSend = componentToSend.newLotto ? componentToSend.newLotto : "";
					var scartoToSend = !componentToSend.scarto ? "0" : componentToSend.scarto;
					var getUrl = "/MOROCOLOR_HUB/com4emezzo?" +
						"&ordine='" + oModelCOM4emezzo.oData.ordine +
						"'&operazione='" + oModelCOM4emezzo.oData.operazione +
						"'&componente='" + componentToSend.componente +
						"'&descrizioneComponente='" + componentToSend.descrizioneComponente +
						"'&ipmacchinario='" + oModelCOM4emezzo.oData.ipMacchinario +
						"'&idsessione='" + oModelCOM4emezzo.oData.idsessione +
						"'&lotto='" + lottoToSend +
						"'&um='" + componentToSend.um +
						"'&consumo='" + componentToSend.consumoConfermato +
						"'&scarto='" + scartoToSend + "'";
					sendCOM4emezzo(that, getUrl);
				}
			}
			if (oModelCOM4emezzo.oData.single === "false") {
				this.onConfirmCOM5();
			} else {
				sap.ui.core.BusyIndicator.hide();
			}
			if (this._oDialog) {
				this._oDialog.destroy();
				this._oDialog = undefined;
			}

			function sendCOM4emezzo(that, getUrl) {
				$.ajax({
					url: getUrl,
					type: "GET",
					data: request,
					dataType: "text",
					contentType: "application/x-www-form-urlencoded",
					success: function (data, textStatus, jqXHR) {
						response = data;
					},
					error: function (xhr, status) {
						that.messageError(that, xhr.responseText);
						return;
					},
					complete: function (xhr, status) {
						oView.setModel(getCom4emezzoModel(that));
					}
				});
			}

			function getCom4emezzoModel(that) {
				var oArray = that.getView().getModel().getData();
				var parser = new DOMParser();
				var xmlDoc = parser.parseFromString(response, "text/xml");
				var returnVal = xmlDoc.getElementsByTagName("com4emezzo")[0].childNodes[0].nodeValue;
				var oData = $.parseJSON(returnVal);
				if (oData.response.Status !== 200) {
					var msgleader = !!that.getView().$().closest(".sapUiSizeCompact").length;
					MessageBox.error(
						oData.response.Message, {
							styleClass: msgleader ? "sapUiSizeCompact" : ""
						}
					);
				} else {
					MessageToast.show(oData.response.Message, {
						duration: 500
					});
				}
				for (var i = 0; i < oArray.impianti.length; i++) {
					var row = oArray.impianti[i];
					if (row.impianto === itemSelected) {
						row.centroDiLavoro = oData.impianto.centroDiLavoro;
						row.chiaveComando = oData.impianto.operazioni.length ? oData.impianto.operazioni[0].chiaveComando : "";
						row.statoMacchinario = oData.impianto.statoMacchinario;
						if (row.statoMacchinario === "SOSP") {
							row.icon = "sap-icon://alert";
						} else {
							row.icon = "sap-icon://instance";
						}
						row.operazioni = that._setOperazioniOrder(oData.impianto.operazioni);
						row.login = "true";
						for (var j = 0; j < row.operazioni.length; j++) {
							if (row.operazioni[j].statoOperazione === "EXEC" && row.operazioni[j].ipMacchinarioExec === ipMacchinarioSelected) {
								row.operazioni[j].statoOperazioneEnh = "EXEC"
							} else if (row.operazioni[j].statoOperazione === "EXEC" && row.operazioni[j].ipMacchinarioExec != ipMacchinarioSelected) {
								row.operazioni[j].statoOperazioneEnh = "EXET"
							} else {
								row.operazioni[j].statoOperazioneEnh = row.operazioni[j].statoOperazione;
							}
						}
						oModel.setData(oArray);
					}
				}
				oModel.setData(oArray);
				return oModel;
			}
		},

		handleLanciaLawer: function (oEvent) {
			var oButton = oEvent.getSource(); // ThumbsUp Button in the row
			// Get binding context of the button to identify the row where the event is originated
			var oBindingContext = oButton.getBindingContext(); // <<<-- If you have model name pass it here as string
			var oBindingObject = oBindingContext.getObject(); // getPath() method gives path to model row number
			var that = this;
			var oView = that.getView();
			var request = "";
			var response = "";
			var oOperazioneModel = "";
			var componentiSilv = [];
			var j = 0;
			var oModel = new sap.ui.model.json.JSONModel();
			var oArray = that.getView().getModel().getData();
			for (var i = 0; i < oArray.impianti.length; i++) {
				var row = oArray.impianti[i];
				if (row.impianto === itemSelected) {
					oOperazioneModel = oBindingObject;
					for (var k = oOperazioneModel.componenti.length - 1; k >= 0; --k) {
						if (oOperazioneModel.componenti[k].descrizioneComponente.indexOf("LAWER") === -1) {
							oOperazioneModel.componenti.splice(k, 1);
						}
					}
					oOperazioneModel.ipMacchinario = row.ipMacchinario;
					oOperazioneModel.idsessione = row.idsessione;
					oOperazioneModel.cid = row.operatori.accettati;
					oOperazioneModel.nomiLawer = row.nomiLawer;
					oOperazioneModel.centroDiLavoro = row.centroDiLavoro;
					oModel.setData(oOperazioneModel);
				}
			}
			if (!oOperazioneModel) {
				var msgleader = !!that.getView().$().closest(".sapUiSizeCompact").length;
				MessageBox.error(
					"Selezionare un'operazione!", {
						styleClass: msgleader ? "sapUiSizeCompact" : ""
					}
				);
				return;
			}
			if (!that._oDialog) {
				Fragment.load({
					id: "fragmentNavCon",
					name: "it.greenorange.mes.view.lanciaLawer",
					controller: that
				}).then(function (oDialog) {
					that._oDialog = oDialog;
					that._oDialog.setModel(oModel);
					oView.addDependent(that._oDialog);
					that._oDialog.setEscapeHandler(this.onExit);
					that._oDialog.open();
				}.bind(that));
			} else {
				that._oDialog.open();
			}
		},

		onConfirmLanciaLawer: function (oEvent) {
			var that = this;
			var request = "";
			var response = "";
			var cid = Fragment.byId("fragmentNavCon", "cid").getSelectedKey();
			var componente = Fragment.byId("fragmentNavCon", "componente").getSelectedKey();
			var execlawer = Fragment.byId("fragmentNavCon", "execlawer").getSelectedKey();
			var oData = this.getView().getModel().getData();
			var oModel = new sap.ui.model.json.JSONModel();
			var oView = this.getView();
			var oModelLanciaLawe = that._oDialog.getModel();
			var oView = this.getView();
			if (!cid || !execlawer) {
				var msgleader = !!that.getView().$().closest(".sapUiSizeCompact").length;
				MessageBox.error(
					"Compilare tutti i campi obbligatori!", {
						styleClass: msgleader ? "sapUiSizeCompact" : ""
					}
				);
				sap.ui.core.BusyIndicator.hide();
				return;
			}

			if (this._oDialog) {
				this._oDialog.destroy();
				this._oDialog = undefined;
			}

			var getUrl = "/MOROCOLOR_HUB/lanciaLaw?" +
				"ordine='" + oModelLanciaLawe.oData.ordine +
				"'&operazione='" + oModelLanciaLawe.oData.operazione +
				"'&sequenza='" + oModelLanciaLawe.oData.sequenza +
				"'&ipmacchinario='" + oModelLanciaLawe.oData.ipMacchinario +
				"'&cid='" + cid +
				"'&cdl='" + oModelLanciaLawe.oData.centroDiLavoro +
				"'&componente='" + componente +
				"'&execlawer='" + execlawer + "'";
			sendLanciaLawer(that, getUrl);

			function sendLanciaLawer(that, getUrl) {
				sap.ui.core.BusyIndicator.show();
				$.ajax({
					url: getUrl,
					type: "GET",
					data: request,
					dataType: "text",
					contentType: "application/x-www-form-urlencoded",
					success: function (data, textStatus, jqXHR) {
						sap.ui.core.BusyIndicator.hide();
						response = data;
					},
					error: function (xhr, status) {
						sap.ui.core.BusyIndicator.hide();
						that.messageError(that, xhr.responseText);
						return;
					},
					complete: function (xhr, status) {
						sap.ui.core.BusyIndicator.hide();
						getLanciaLawerModel(that);
						operationSelected = "";
					}
				});
			}

			function getLanciaLawerModel(that) {
				var oArray = that.getView().getModel().getData();
				var parser = new DOMParser();
				var xmlDoc = parser.parseFromString(response, "text/xml");
				var returnVal = xmlDoc.getElementsByTagName("lanciaLaw")[0].childNodes[0].nodeValue;
				var oData = $.parseJSON(returnVal);
				if (oData.response.Status !== 200) {
					var msgleader = !!that.getView().$().closest(".sapUiSizeCompact").length;
					MessageBox.error(
						oData.response.Message, {
							styleClass: msgleader ? "sapUiSizeCompact" : ""
						}
					);
				} else {
					MessageToast.show(oData.response.Message, {
						duration: 500
					});
				}
				for (var i = 0; i < oArray.impianti.length; i++) {
					var row = oArray.impianti[i];
					if (row.impianto === itemSelected) {
						row.centroDiLavoro = oData.impianto.centroDiLavoro;
						row.chiaveComando = oData.impianto.operazioni.length ? oData.impianto.operazioni[0].chiaveComando : "";
						row.statoMacchinario = oData.impianto.statoMacchinario;
						if (row.statoMacchinario === "SOSP") {
							row.icon = "sap-icon://alert";
						} else {
							row.icon = "sap-icon://instance";
						}
						row.operazioni = that._setOperazioniOrder(oData.impianto.operazioni);
						row.login = "true";
						for (var j = 0; j < row.operazioni.length; j++) {
							if (row.operazioni[j].statoOperazione === "EXEC" && row.operazioni[j].ipMacchinarioExec === ipMacchinarioSelected) {
								row.operazioni[j].statoOperazioneEnh = "EXEC"
							} else if (row.operazioni[j].statoOperazione === "EXEC" && row.operazioni[j].ipMacchinarioExec != ipMacchinarioSelected) {
								row.operazioni[j].statoOperazioneEnh = "EXET"
							} else {
								row.operazioni[j].statoOperazioneEnh = row.operazioni[j].statoOperazione;
							}
						}
						oModel.setData(oArray);
						oModel.updateBindings();
					}
				}
				return oModel;
			}
		},

		onRefresh: function (oModelCOM4emezzo, fromMethod) {
			var that = this;
			var oView = that.getView();
			var request = "";
			var response = "";
			var ipMacchinario = "";
			var oModel = new sap.ui.model.json.JSONModel();
			var oArray = that.getView().getModel().getData();
			for (var i = 0; i < oArray.impianti.length; i++) {
				var row = oArray.impianti[i];
				if (row.impianto === itemSelected) {
					ipMacchinario = row.ipMacchinario;
				}
			}
			var getUrl = "/MOROCOLOR_HUB/refresh?" +
				"'&ipmacchinario='" + ipMacchinario + "'";
			sendRefresh(that, getUrl);

			function sendRefresh(that, getUrl) {
				sap.ui.core.BusyIndicator.show();
				$.ajax({
					url: getUrl,
					type: "GET",
					data: request,
					dataType: "text",
					contentType: "application/x-www-form-urlencoded",
					success: function (data, textStatus, jqXHR) {
						sap.ui.core.BusyIndicator.hide();
						response = data;
					},
					error: function (xhr, status) {
						sap.ui.core.BusyIndicator.hide();
						that.messageError(that, xhr.responseText);
						return;
					},
					complete: function (xhr, status) {
						sap.ui.core.BusyIndicator.hide();
						oView.setModel(getRefreshModel(that, fromMethod));
						if (fromMethod === "com4eMezzo") {
							// entro qui dentro se questo metodo è stato richiamato dalla com4eMezzo per passare alla visualizzazione dei componenti
							// i componenti che verranno mostrati saranno aggiornati da questa chiamata
							var refreshData = oView.getModel().getData();
							var impianto = _.find(refreshData.impianti, {
								impianto: itemSelected
							});
							var dialogData = oModelCOM4emezzo.getData();
							var selectedOperation = _.find(impianto.operazioni, {
								ordine: dialogData.ordine,
								operazione: dialogData.operazione
							});
							_.forEach(dialogData.componenti, function (n) {
								var comp = _.find(selectedOperation.componenti, {
									componente: n.componente
								});
								n.lotti = comp.lotti;
								n.selected = true;
							});
							var oNavCon = Fragment.byId("fragmentNavCon", "navCon");
							var oDetailPage = Fragment.byId("fragmentNavCon", "detail");
							var oTableComponents = Fragment.byId("fragmentNavCon", "tblComponents");
							oModelCOM4emezzo.refresh();
							oDetailPage.setModel(oModelCOM4emezzo);
							oNavCon.to(oDetailPage);
						} else {
							operationSelected = "";
						}
					}
				});
			}

			function getRefreshModel(that, fromMethod) {
				var oArray = that.getView().getModel().getData();
				var parser = new DOMParser();
				var xmlDoc = parser.parseFromString(response, "text/xml");
				var returnVal = xmlDoc.getElementsByTagName("refresh")[0].childNodes[0].nodeValue;
				var oData = $.parseJSON(returnVal);
				if (oData.response.Status !== 200) {
					var msgleader = !!that.getView().$().closest(".sapUiSizeCompact").length;
					MessageBox.error(
						oData.response.Message, {
							styleClass: msgleader ? "sapUiSizeCompact" : ""
						}
					);
				} else if (!fromMethod) {
					MessageToast.show(oData.response.Message, {
						duration: 500
					});
				}
				for (var i = 0; i < oArray.impianti.length; i++) {
					var row = oArray.impianti[i];
					if (row.impianto === itemSelected) {
						row.centroDiLavoro = oData.impianto.centroDiLavoro;
						row.chiaveComando = oData.impianto.operazioni.length ? oData.impianto.operazioni[0].chiaveComando : "";
						row.statoMacchinario = oData.impianto.statoMacchinario;
						if (row.statoMacchinario === "SOSP") {
							row.icon = "sap-icon://alert";
						} else {
							row.icon = "sap-icon://instance";
						}
						row.operazioni = that._setOperazioniOrder(oData.impianto.operazioni);
						row.login = "true";
						for (var j = 0; j < row.operazioni.length; j++) {
							if (row.operazioni[j].statoOperazione === "EXEC" && row.operazioni[j].ipMacchinarioExec === ipMacchinarioSelected) {
								row.operazioni[j].statoOperazioneEnh = "EXEC"
							} else if (row.operazioni[j].statoOperazione === "EXEC" && row.operazioni[j].ipMacchinarioExec != ipMacchinarioSelected) {
								row.operazioni[j].statoOperazioneEnh = "EXET"
							} else {
								row.operazioni[j].statoOperazioneEnh = row.operazioni[j].statoOperazione;
							}
						}
						oModel.setData(oArray);
						oModel.updateBindings();
					}
				}
				return oModel;
			}
		},

		/*-- PP01	COM6	CONSUMO/SCARTO COMPONENTI --*/
		handleCommandCOM7: function (oEvent) {
			var that = this;
			var oView = that.getView();
			var request = "";
			var response = "";
			var operazione = "";
			var oOperazioneModel = "";
			var oModel = new sap.ui.model.json.JSONModel();
			var oArray = that.getView().getModel().getData();

			if (!that._oDialog) {
				Fragment.load({
					name: "it.greenorange.mes.view.COM7",
					controller: that
				}).then(function (oDialog) {
					that._oDialog = oDialog;
					that._oDialog.setModel(oModel);
					oView.addDependent(that._oDialog);
					that._oDialog.setEscapeHandler(this.onExit);
					that._oDialog.open();
				}.bind(that));
			} else {
				that._oDialog.open();
			}
		},

		onConfirmCOM7: function (oEvent) {
			var that = this;
			var request = "";
			var response = "";
			var articolo = "";
			var lotto = "";
			var getUrl = "";
			var idsessione = ""
			var ipmacchinario = "";
			var oData = this.getView().getModel().getData();
			var oView = this.getView();
			var oModel = that._oDialog.getModel();
			var articolo = sap.ui.getCore().byId("inp_art").getValue();

			for (var i = 0; i < oData.impianti.length; i++) {
				var row = oData.impianti[i];
				if (row.impianto === itemSelected) {
					idsessione = row.idsessione;
					ipmacchinario = row.ipMacchinario;
				}
			}
			var getUrl = "/MOROCOLOR_HUB/com7?" +
				"articolo='" + articolo +
				"'&idsessione='" + idsessione +
				"'&ipmacchinario='" + ipmacchinario +
				"'";

			if (articolo === "") {
				that.messageError(that, "Inserire un articolo!");
				return;
			}

			sendCOM7(that, getUrl);

			function sendCOM7(that, getUrl) {
				sap.ui.core.BusyIndicator.show();
				$.ajax({
					url: getUrl,
					type: "GET",
					data: request,
					dataType: "text",
					contentType: "application/x-www-form-urlencoded",
					success: function (data, textStatus, jqXHR) {
						sap.ui.core.BusyIndicator.hide();
						response = data;
					},
					error: function (xhr, status) {
						sap.ui.core.BusyIndicator.hide();
						that.messageError(that, xhr.responseText);
						return;
					},
					complete: function (xhr, status) {
						sap.ui.core.BusyIndicator.hide();
						oView.setModel(getCom7Model(that));
					}
				});
			}
			if (this._oDialog) {
				this._oDialog.destroy();
				this._oDialog = undefined;
			}

			function getCom7Model(that) {
				var oArray = that.getView().getModel().getData();
				var parser = new DOMParser();
				var xmlDoc = parser.parseFromString(response, "text/xml");
				var returnVal = xmlDoc.getElementsByTagName("com7")[0].childNodes[0].nodeValue;
				var oData = $.parseJSON(returnVal);
				if (oData.response.Status !== 200) {
					var msgleader = !!that.getView().$().closest(".sapUiSizeCompact").length;
					MessageBox.error(
						oData.response.Message, {
							styleClass: msgleader ? "sapUiSizeCompact" : ""
						}
					);
				} else {
					MessageToast.show(oData.response.Message, {
						duration: 500
					});
				}
				for (var i = 0; i < oArray.impianti.length; i++) {
					var row = oArray.impianti[i];
					if (row.impianto === itemSelected) {
						row.centroDiLavoro = oData.impianto.centroDiLavoro;
						row.chiaveComando = oData.impianto.operazioni.length ? oData.impianto.operazioni[0].chiaveComando : "";
						row.statoMacchinario = oData.impianto.statoMacchinario;
						if (row.statoMacchinario === "SOSP") {
							row.icon = "sap-icon://alert";
						} else {
							row.icon = "sap-icon://instance";
						}
						row.operazioni = that._setOperazioniOrder(oData.impianto.operazioni);
						row.login = "true";
						for (var j = 0; j < row.operazioni.length; j++) {
							if (row.operazioni[j].statoOperazione === "EXEC" && row.operazioni[j].ipMacchinarioExec === ipMacchinarioSelected) {
								row.operazioni[j].statoOperazioneEnh = "EXEC"
							} else if (row.operazioni[j].statoOperazione === "EXEC" && row.operazioni[j].ipMacchinarioExec != ipMacchinarioSelected) {
								row.operazioni[j].statoOperazioneEnh = "EXET"
							} else {
								row.operazioni[j].statoOperazioneEnh = row.operazioni[j].statoOperazione;
							}
						}
						oModel.setData(oArray);
					}
				}
				return oModel;
			}
		},

		/*-- PP01	COM9	CONSUMO/SCARTO COMPONENTI --*/
		handleCommandCOM9: function (oEvent) {
			var that = this;
			var oView = that.getView();
			var oOperazioneModel = "";
			var oModel = new sap.ui.model.json.JSONModel();
			var oArray = that.getView().getModel().getData();
			var oLotto = "";
			var oOrdine = "";
			var oOperation = "";
			for (var i = 0; i < oArray.impianti.length; i++) {
				var row = oArray.impianti[i];
				if (row.impianto === itemSelected) {
					for (var j = 0; j < row.operazioni.length; j++) {
						if (row.operazioni[j].statoOperazione === "EXEC" && row.operazioni[j].ipMacchinarioExec === ipMacchinarioSelected) {
							oLotto = row.operazioni[j].lottoControllo;
							oOrdine = row.operazioni[j].ordine;
							oOperation = row.operazioni[j].operazione;
						}
					}
				}
			}
			/*  SVILUPPO */
			/*  PRODUZIONE */
			var url =
				"https://insprsltmans1extension-ijkyq6bcfi.dispatcher.eu3.hana.ondemand.com/index.html?#title-display&/initFromExternal/" +
				oLotto +
				"/" + oOrdine + "/" + oOperation;

			/*  PRODUZIONE */
			window.open(url, "_blank");
		},

		/*-- PP01	COM9	CONSUMO/SCARTO COMPONENTI --*/
		/*-- PP01	COM10	STAMPA ETICHETTE          --*/
		handleCommandCOM10: function (oEvent) {
			var that = this;
			var oView = that.getView();
			var request = "";
			var response = "";
			var operazione = "";
			var oOperazioneModel = "";
			var oModel = new sap.ui.model.json.JSONModel();
			var oArray = that.getView().getModel().getData();

			for (var i = 0; i < oArray.impianti.length; i++) {
				var row = oArray.impianti[i];
				if (row.impianto === itemSelected) {
					for (var j = 0; j < row.operazioni.length; j++) {
						if (row.operazioni[j].ordine === operationSelected.ordine && row.operazioni[j].operazione === operationSelected.operazione) {
							oOperazioneModel = row.operazioni[j];
							oOperazioneModel.cid = row.cid;
							oOperazioneModel.stampa = row.stampa;
							oOperazioneModel.chiaveComando = row.chiaveComando;
							oOperazioneModel.ipMacchinario = row.ipMacchinario;
							oOperazioneModel.cid = row.operatori.accettati;
							oModel.setData(oOperazioneModel);
						}
					}
				}
			}
			if (oOperazioneModel === "") {
				var msgleader = !!that.getView().$().closest(".sapUiSizeCompact").length;
				MessageBox.error(
					"Selezionare un'operazione!", {
						styleClass: msgleader ? "sapUiSizeCompact" : ""
					}
				);
				return;
			}
			if (!that._oDialog) {
				Fragment.load({
					name: "it.greenorange.mes.view.COM10",
					controller: that
				}).then(function (oDialog) {
					that._oDialog = oDialog;
					that._oDialog.setModel(oModel);
					oView.addDependent(that._oDialog);
					that._oDialog.setEscapeHandler(this.onExit);
					that._oDialog.open();
				}.bind(that));
			} else {
				that._oDialog.open();
			}
		},

		onConfirmCOM10: function (oEvent) {
			var that = this;
			var request = "";
			var response = "";
			var articolo = "";
			var lotto = "";
			var getUrl = "";
			var stampa = "";
			var oData = this.getView().getModel().getData();
			var oView = this.getView();
			var oModel = that._oDialog.getModel();
			var printID = sap.ui.getCore().byId("RBG0").getSelectedIndex();
			var cid = sap.ui.getCore().byId("cid").getSelectedKey();
			//MessageToast.show(printID);
			var numeroetichette = sap.ui.getCore().byId("inp_eti").getValue();
			var quantita = sap.ui.getCore().byId("inp_qta").getValue();

			switch (printID) {
			case 0: // Stampa etichette
				var getUrl = "/MOROCOLOR_HUB/stampaTermica?" +
					"ordine='" + oModel.oData.ordine +
					"'&operazione='" + oModel.oData.operazione +
					"'&tipo='" + "T" +
					"'&operatore='" + cid +
					"'&numeroetichette=" + numeroetichette +
					"&quantita=" + quantita +
					"&ipmacchinario='" + oModel.oData.ipMacchinario +
					"'";
				stampa = "stampaTermica";
				break;
			case 1: // Marcatore Laser
				var getUrl = "/MOROCOLOR_HUB/stampaMarcatoreLaser?" +
					"ordine='" + oModel.oData.ordine +
					"'&operazione='" + oModel.oData.operazione +
					"'&ipmacchinario='" + oModel.oData.ipMacchinario +
					"'";
				stampa = "stampaMarcatoreLaser";
				break;
			case 2: // Stampa tipo Q
				var getUrl = "/MOROCOLOR_HUB/stampaTermica?" +
					"ordine='" + oModel.oData.ordine +
					"'&operazione='" + oModel.oData.operazione +
					"'&tipo='" + "Q" +
					"'&operatore='" + oModel.oData.cid +
					"'&numeroetichette=" + numeroetichette +
					"&quantita=" + quantita +
					"&ipmacchinario='" + oModel.oData.ipMacchinario +
					"'";
				stampa = "stampaTermica";
				break;
			default:
				// code block
			}
			if (getUrl === "") {
				that.messageError(that, "Selezione non valida!");
				return;
			}
			sendCOM10(that, getUrl, stampa);

			function sendCOM10(that, getUrl, stampa) {
				sap.ui.core.BusyIndicator.show();
				$.ajax({
					url: getUrl,
					type: "GET",
					data: request,
					dataType: "text",
					contentType: "application/x-www-form-urlencoded",
					success: function (data, textStatus, jqXHR) {
						sap.ui.core.BusyIndicator.hide();
						response = data;
					},
					error: function (xhr, status) {
						sap.ui.core.BusyIndicator.hide();
						that.messageError(that, xhr.responseText);
						that.onExit();
						return;
					},
					complete: function (xhr, status) {
						sap.ui.core.BusyIndicator.hide();
						getCom10Model(that, stampa);
						that.onExit();
					}
				});
			}

			function getCom10Model(that, stampa) {
				var oArray = that.getView().getModel().getData();
				var parser = new DOMParser();
				var xmlDoc = parser.parseFromString(response, "text/xml");
				var returnVal = xmlDoc.getElementsByTagName(stampa)[0].childNodes[0].nodeValue;
				var oData = $.parseJSON(returnVal);
				if (oData.response.Status !== 200) {
					var msgleader = !!that.getView().$().closest(".sapUiSizeCompact").length;
					MessageBox.error(
						oData.response.Message, {
							styleClass: msgleader ? "sapUiSizeCompact" : ""
						}
					);
				} else {
					MessageToast.show(oData.response.Message, {
						duration: 1000
					});
				}
			}
		},

		/*-- PP01	COM10	STAMPA ETICHETTE          --*/
		onOK: function (oEvent) {
			oEvent.getSource().close();
		},

		onCancel: function (oEvent) {
			oEvent.getSource().close();
		},

		formatAvailableToObjectState: function (bAvailable) {
			return bAvailable ? "Success" : "Error";
		},

		formatAvailableToIcon: function (bAvailable) {
			return bAvailable ? "sap-icon://accept" : "sap-icon://decline";
		},

		handleDetailsPress: function (oEvent) {
			MessageToast.show("Details for product with id " + this.getView().getModel().getProperty("ProductId", oEvent.getSource().getBindingContext()));
		},

		onGenericTagPress: function (oEvent) {
			if (!this.usersDialog) {
				this.usersDialog = sap.ui.xmlfragment("it.greenorange.mes.view.Card", this);
				this.getView().addDependent(this.usersDialog);
			}
			this.usersDialog.openBy(oEvent.getSource());
		},

		handleSelectDialogPress: function (oEvent) {
			if (!this._oDialog) {
				this._oDialog = sap.ui.xmlfragment("it.greenorange.mes.view.PP01_COM6", this);
				this.getView().addDependent(this._oDialog);
			}
			this._oDialog.openBy(oEvent.getSource());
		},

		/**
		 *@memberOf it.greenorange.mes.controller.main
		 */
		action: function (oEvent) {
			var that = this;
			var actionParameters = JSON.parse(oEvent.getSource().data("wiring").replace(/'/g, "\""));
			var eventType = oEvent.getId();
			var aTargets = actionParameters[eventType].targets || [];
			aTargets.forEach(function (oTarget) {
				var oControl = that.byId(oTarget.id);
				if (oControl) {
					var oParams = {};
					for (var prop in oTarget.parameters) {
						oParams[prop] = oEvent.getParameter(oTarget.parameters[prop]);
					}
					oControl[oTarget.action](oParams);
				}
			});
			var oNavigation = actionParameters[eventType].navigation;
			if (oNavigation) {
				var oParams = {};
				(oNavigation.keys || []).forEach(function (prop) {
					oParams[prop.name] = encodeURIComponent(JSON.stringify({
						value: oEvent.getSource().getBindingContext(oNavigation.model).getProperty(prop.name),
						type: prop.type
					}));
				});
				if (Object.getOwnPropertyNames(oParams).length !== 0) {
					this.getOwnerComponent().getRouter().navTo(oNavigation.routeName, oParams);
				} else {
					this.getOwnerComponent().getRouter().navTo(oNavigation.routeName);
				}
			}
		},

		onItemSelected: function (oEvent) {
			if (oEvent.getParameter("item")) {
				var that = this;
				var oArray = that.getView().getModel().getData();
				itemSelected = typeof (oEvent) === "string" ? oEvent : oEvent.getParameter("item").getName();
				for (var i = 0; i < oArray.impianti.length; i++) {
					var row = oArray.impianti[i];
					if (row.impianto === itemSelected) {
						ipMacchinarioSelected = row.ipMacchinario;
						sensorIdSelected = row.ipMacchinario;
						this._setLoginInputFocus(500);
						this.getView().setModel(that.getMacchinarioUserLoggedIn(this.getView().getModel()), "usersModel");
						break;
					}
				}
			}
			this._clearTableSelection();
		},

		onChangeInputScarto: function (evt) {
			var selectedComponent = evt.getSource().getParent().getBindingContext().getObject();
			selectedComponent.selected = true;
		},

		_clearTableSelection: function () {
			if (operationSelected) {
				operationSelected = undefined;
			}
			var oModel = this.getView().getModel();
			if (oModel && itemSelected) {
				var macchinari = oModel.getProperty("/impianti");
				var selectedMacchinario = _.find(macchinari, {
					impianto: itemSelected
				});
				var layout = selectedMacchinario.layout ? selectedMacchinario.layout.toUpperCase() : "F";
				selectedMacchinario.layout = layout;
				var table = this.byId("tblOrders" + layout);
				table.clearSelection();
			}
		},

		onAddRow: function () {
			this._setVisibleRowCount("plus");
		},

		onLessRow: function () {
			this._setVisibleRowCount("less");
		},

		_setVisibleRowCount: function (operation) {
			var oModel = this.getView().getModel();
			var macchinari = oModel.getProperty("/impianti");
			var macchinario = _.find(macchinari, {
				impianto: itemSelected
			});
			var rowsNumber = macchinario.rowsNumber;
			if (operation === "plus") {
				rowsNumber++;
			} else {
				rowsNumber--;
			}
			_.forEach(macchinari, function (n) {
				n.rowsNumber = rowsNumber;
			});
			oModel.refresh();
		},

		_setOperazioniOrder: function (operazioni) {
			// le operazioni vengono ordinate per Descrizione stato e poi per Data
			// prima ordino per stato (così il successivo raggruppamento va in ordine alfabetico dello stato), poi raggruppo per stato, infine ordino per data all'interno di ogni gruppo
			operazioni = _.orderBy(operazioni, "statoOperazione");
			var operazioniGrouped = _.groupBy(operazioni, "statoOperazione");
			var operazioniAll = [];
			var operazioniConc = [];
			for (var j in operazioniGrouped) {
				var operazioniByStatus = _.orderBy(operazioniGrouped[j], function (n) {
					return new Date(n.dataInizioRichiesta);
				});
				if (j === "CONC") {
					operazioniConc = operazioniByStatus;
				} else {
					for (var k = 0; k < operazioniByStatus.length; k++) {
						operazioniAll.push(operazioniByStatus[k]);
					}
				}
			}
			// le eventuali operazioni concluse presenti devono andare alla fine dell'array
			if (operazioniConc.length) {
				for (j = 0; j < operazioniConc.length; j++) {
					operazioniAll.push(operazioniConc[j]);
				}
			}
			return operazioniAll;
		},

		/* exit  controller */
		onExit: function () {
			if (this._oDialog) {
				this._oDialog.destroy();
				this._oDialog = undefined;
			}
		}
	});
});