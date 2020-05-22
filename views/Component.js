sap.ui.define([
	"sap/ui/core/UIComponent",
	"sap/ui/Device",
	"it/greenorange/mes/model/models",
	"sap/base/Log"
], function (UIComponent, Device, models, Log) {
	"use strict";
    
	return UIComponent.extend("it.greenorange.mes.Component", {

		metadata: {
			manifest: "json",
			config: { fullWidth: true }
		},
		/**
		 * The component is initialized by UI5 automatically during the startup of the app and calls the init method once.
		 * @public
		 * @override
		 */
		init: function () {
			// call the base component's init function
			UIComponent.prototype.init.apply(this, arguments);
			this.setModel(new sap.ui.model.json.JSONModel(), "viewsDataModel");
			// enable routing
			this.getRouter().initialize();

			// set the device model
			this.setModel(models.createDeviceModel(), "device");
		}
	});
});