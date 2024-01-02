import Graphic from "@arcgis/core/Graphic";
import PopupTemplate from "@arcgis/core/PopupTemplate";
import WebMap from "@arcgis/core/WebMap";
import * as reactiveUtils from "@arcgis/core/core/reactiveUtils";
import Point from "@arcgis/core/geometry/Point";
import CustomContent from "@arcgis/core/popup/content/CustomContent";
import MapView from "@arcgis/core/views/MapView";
import Editor from "@arcgis/core/widgets/Editor";
import Expand from "@arcgis/core/widgets/Expand";
import LayerList from "@arcgis/core/widgets/LayerList";
import OrientedImageryViewer from "@arcgis/core/widgets/OrientedImageryViewer";
import { defineCustomElements } from "@esri/calcite-components/dist/loader";
import "./style.css";

defineCustomElements(window, {
  resourcesUrl: "https://js.arcgis.com/calcite-components/2.1.0/assets",
});

const map = new WebMap({
  portalItem: {
    // autocasts as new PortalItem()
    id: "4eab79e1e2354b69adc4eda847b4de16",
  },
});
const view = new MapView({
  map: map,
  container: "viewDiv",
  popupEnabled: false,
});
map.load().then(async () => {
  await map.basemap.loadAll();
  for (const layer of map.basemap.baseLayers) {
    //layer.effect = "grayscale(75%)"
  }
});
/*************************************
 LAYERS
*************************************/
let featureLayer;
const imageryItemID = "46c41012717549088957ef5ed6c6091f"; //Walchensee
/*************************************
 Widgets/components
*************************************/
const layerList = new LayerList({
  view: view,
  selectionMode: "single",
});
const expand = new Expand({
  view: view,
  content: layerList,
});
view.ui.add(expand, "bottom-left");
const orientedImageryViewer = new OrientedImageryViewer({
  view,
  disabled: true,
  docked: true,
  dockEnabled: true,
  container: "oi-container",
});
const flow = document.getElementById("workorder-flow");
const imageryReviewStep = document.querySelectorAll("imagery-review-step");
/*************************************
 Popup setup
*************************************/
const contentWidget = new CustomContent({
  outFields: ["*"],
  creator: (event) => {
    const viewImageryBtn = document.createElement("calcite-button");
    viewImageryBtn.setAttribute("appearance", "outline");
    viewImageryBtn.innerText = "view available imagery";
    viewImageryBtn.classList.add("custom-theme");
    viewImageryBtn.onclick = () => {
      orientedImageryViewer?.loadBestImage(event.graphic.geometry);
    };
    return viewImageryBtn;
  },
});
const fieldDisplay = {
  type: "fields",
  fieldInfos: [
    {
      fieldName: "requesttype",
      label: "Category",
    },
    {
      fieldName: "Category",
      label: "Request type",
    },
  ],
};
let textElement = {
  type: "text",
  text: 'This work order is to resolve an issue with {Category} ({requesttype}).<br><br>Notes: "{details}"',
};
const template = new PopupTemplate({
  outFields: ["*"],
  title: "Work order",
  content: [textElement, contentWidget],
});
/*************************************
 Now wire it together
*************************************/
view.on("layerview-create", ({ layer, layerView }) => {
  if (layer.type === "oriented-imagery") {
    layer.renderer = {
      type: "simple", // autocasts as new SimpleRenderer()
      symbol: {
        type: "simple-marker", // autocasts as new SimpleMarkerSymbol()
        size: 6,
        color: [104, 108, 110, 0.5],
        outline: {
          width: 0,
        },
      },
    };
    orientedImageryViewer.layer = layer;
  } else if (layer.type === "feature" && layer.title === "Work Orders") {
    featureLayer = layer;
    featureLayer.outFields = ["*"];
    featureLayer.popupTemplate = template;
    reactiveUtils.when(
      () => !layerView.dataUpdating,
      () => {
        console.log("let's update the table.");
        updateTable(layer);
      }
    );
  }
});
//when the user clicks on a feature show a popup, if not, pull up the imagery
view.on("click", (event) => {
  view
    .hitTest(event, {
      layer: featureLayer,
    })
    .then((response) => {
      const results = response.results;
      if (
        results.length > 0 &&
        results[0].graphic &&
        results[0].graphic.layer === featureLayer
      ) {
        view.openPopup({
          location: event.mapPoint,
          features: [results[0].graphic],
        });
      } else {
        orientedImageryViewer.loadBestImage(event.mapPoint);
      }
    });
});
document.getElementById("btnUpdate").onclick = async () => {
  //start the work order flow
  createWorkOrderFlow();
};
/*************************************
 Table setup
*************************************/
const table = document.querySelector("calcite-table");

function updateTable(layer) {
  const query = layer.createQuery();
  query.outStatistics = [
    {
      onStatisticField: "requesttype",
      outStatisticFieldName: "count_requesttype",
      statisticType: "count",
    },
  ];
  query.groupByFieldsForStatistics = ["Category"];
  const cartegoryCodedNames = [];
  layer.fields.forEach((field) => {
    if (!field.domain || field.name === "requesttype") {
      return;
    }
    let domain = field.domain;
    if (domain.type === "coded-value") {
      domain.codedValues.forEach((codeValue) => {
        cartegoryCodedNames.push(codeValue);
      });
    }
  });
  layer.queryFeatures(query).then(function (results) {
    //const stats = results.features[0].attributes;
    results.features.forEach(function (feature) {
      let tableRow = document.createElement("calcite-table-row");
      const code = feature.attributes.Category;
      const prettyCategory = cartegoryCodedNames.find(
        (value) => value.code === code
      );
      tableRow.innerHTML =
        `<calcite-table-cell>${prettyCategory.name}</calcite-table-cell>` +
        `<calcite-table-cell alignment="end">${feature.attributes.count_requesttype}</calcite-table-cell>` +
        `<calcite-table-cell><calcite-meter fill-type="single" value-label label="progress" value="${
          code * 25
        }" max="100" unit-label="%"
              value-label-type="units" scale="s"></calcite-meter></calcite-table-cell>` +
        //`<calcite-table-cell alignment="center"><calcite-button icon-start="oriented-imagery-widget" round></calcite-button></calcite-table-cell>`;
        `<calcite-table-cell><calcite-select><calcite-option value="Euan">Euan</calcite-option><calcite-option value="Dave">Dave</calcite-option></calcite-select></calcite-table-cell>`;
      table.append(tableRow);
    });
    console.log(results.features);
  });
}
/*************************************
 Setup flow
*************************************/
async function createWorkOrderFlow() {
  //Create UI
  const workOrderFlowItem = document.createElement("calcite-flow-item");
  //workOrderFlowItem.style = "height: 100%; width: 100%; position: relative; padding: 5px; overflow: hidden;"
  workOrderFlowItem.heading = "Create work order";
  workOrderFlowItem.description = "Please fill out this form";
  const notice = document.createElement("calcite-notice");
  notice.open = true;
  notice.width = "full";
  workOrderFlowItem.append(notice);
  const noticeMessage = document.createElement("span");
  noticeMessage.slot = "message";
  noticeMessage.innerText = "What is the problem?";
  notice.append(noticeMessage);
  const editor = new Editor({
    view: view,
    container: workOrderFlowItem,
  });
  if (orientedImageryViewer.referencePoint) {
    console.log(orientedImageryViewer.referencePoint);
    const featureToCreate = new Graphic({
      geometry: new Point({
        x: orientedImageryViewer.referencePoint.x,
        y: orientedImageryViewer.referencePoint.y,
        spatialReference: view.spatialReference,
      }),
      sourceLayer: featureLayer,
    });
    await editor.viewModel.startCreateFeaturesWorkflowAtFeatureEdit({
      initialFeature: featureToCreate,
    });
    const activeWorkflow = editor.viewModel.activeWorkflow;
    editor.viewModel.on("workflow-commit", () => {
      killEditingSesh();
    });
  } else {
    console.log("need to select reference point first.");
  }

  function killEditingSesh() {
    if (editor) {
      const { activeWorkflow } = editor.viewModel;
      editor.cancelWorkflow({
        force: true,
      });
      activeWorkflow?.destroy();
    }
  }
  workOrderFlowItem.addEventListener("calciteFlowItemBack", killEditingSesh);
  flow.append(workOrderFlowItem);
}
document
  .getElementById("create-view")
  .addEventListener("calciteMenuItemSelect", enableMapView);

function enableMapView() {
  document.getElementById("table-panel").setAttribute("collapsed", "true");
}
document
  .getElementById("table-view")
  .addEventListener("calciteMenuItemSelect", enableTableView);

function enableTableView() {
  document.getElementById("table-panel").removeAttribute("collapsed");
}
