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
  resourcesUrl: "https://js.arcgis.com/calcite-components/2.4.0/assets",
});

let featureLayer;

const map = new WebMap({
  portalItem: {
    // autocasts as new PortalItem()
    id: "518d922fcc8a4b4bbf7586cff6dacbae",
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
    // layer.effect = "grayscale(75%)";
    layer.effect = "bloom(50%)";
  }
});

/*************************************
 Widgets/components
*************************************/
// LayerList
const layerList = new LayerList({
  view: view,
  selectionMode: "single",
});
const expand = new Expand({
  view: view,
  content: layerList,
});
view.ui.add(expand, "bottom-left");

// OrientedImageryViewer
const orientedImageryViewer = new OrientedImageryViewer({
  view,
  disabled: true,
  docked: true,
  dockEnabled: true,
  container: "oi-container",
});
const flow = document.getElementById("workorder-flow");

/*************************************
 Popup setup
*************************************/
const contentWidget = new CustomContent({
  outFields: ["*"],
  creator: (event) => {
    const viewImageryBtn = document.createElement("calcite-button");
    viewImageryBtn.setAttribute("appearance", "outline");
    viewImageryBtn.innerText = "view available imagery";
    viewImageryBtn.onclick = () => {
      orientedImageryViewer?.loadBestImage(event.graphic.geometry);
    };
    return viewImageryBtn;
  },
});

let textElement = {
  type: "text",
  text: 'This work order is to resolve an issue with {Category}.<br><br>Notes: "{details}"',
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
      type: "simple",
      symbol: {
        type: "simple-marker",
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

async function updateTable(layer) {
  const totalNumberOfWorkOrders = await layer.queryFeatureCount();

  table.querySelectorAll("calcite-table-row").forEach((row) => {
    if (row.slot !== "table-header") {
      row.remove();
    }
  });

  const categoryCodedValues = [];
  layer.fields.forEach((field) => {
    if (field.name === "Category" && field.domain.type === "coded-value") {
      field.domain.codedValues.forEach((codedValue) => {
        categoryCodedValues.push(codedValue);
      });
    }
  });

  const query = layer.createQuery();
  query.outStatistics = [
    {
      onStatisticField: "Category",
      outStatisticFieldName: "count_Category",
      statisticType: "count",
    },
  ];
  query.groupByFieldsForStatistics = ["Category"];

  layer.queryFeatures(query).then((results) => {
    results.features.forEach((feature) => {
      let tableRow = document.createElement("calcite-table-row");
      const code = feature.attributes.Category;
      const categoryCodedValue = categoryCodedValues.find(
        (value) => value.code === code
      );
      let nameTableCell = document.createElement("calcite-table-cell");
      nameTableCell.innerHTML = categoryCodedValue.name;
      tableRow.append(nameTableCell);

      let countTableCell = document.createElement("calcite-table-cell");
      countTableCell.innerHTML = feature.attributes.count_Category;
      tableRow.append(countTableCell);

      let percentTableCell = document.createElement("calcite-table-cell");
      let meter = document.createElement("calcite-meter");
      meter.fillType = "single";
      meter.valueLabel = true;
      meter.label = "percent";
      meter.value = Math.round(
        (feature.attributes.count_Category / totalNumberOfWorkOrders) * 100
      );
      meter.max = 100;
      meter.unitLabel = "%";
      meter.valueLabelType = "units";
      meter.scale = "s";
      percentTableCell.append(meter);
      tableRow.append(percentTableCell);

      table.append(tableRow);
    });
  });
}

/*************************************
 Setup flow
*************************************/
async function createWorkOrderFlow() {
  //Create UI
  const workOrderFlowItem = document.createElement("calcite-flow-item");
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

    editor.viewModel.on("workflow-commit", () => {
      cancelWorkflow();
    });
  } else {
    console.warning("need to select reference point first.");
  }

  workOrderFlowItem.addEventListener("calciteFlowItemBack", cancelWorkflow);
  flow.append(workOrderFlowItem);

  function cancelWorkflow() {
    if (editor) {
      const { activeWorkflow } = editor.viewModel;
      if (activeWorkflow) {
        editor.cancelWorkflow({
          force: true,
        });
      }
    }
  }
}
