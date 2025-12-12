/*!***************************************************
 * Google Map (Low Saturation -80 Style)
 *****************************************************/

window.marker = null;

// 挂载到 window 以便 Google API 回调
window.initMap = function() {
  var mapId = document.getElementById("map");
  if (!mapId) return;

  // 1. 读取 HTML 参数
  var latitude = parseFloat(mapId.getAttribute("data-latitude"));
  var longitude = parseFloat(mapId.getAttribute("data-longitude"));
  var mapMarker = mapId.getAttribute("data-marker");
  var mapMarkerName = mapId.getAttribute("data-marker-name");
  
  // 读取缩放级别 (如果没有设置，默认用 13)
  var zoomLevel = parseInt(mapId.getAttribute("data-zoom")) || 13;

  var centerPoint = new google.maps.LatLng(latitude, longitude);

  // 2. 定义样式：低饱和度 (-80)
  // 这会让地图保留淡淡的颜色，但整体偏灰，非常有质感
  var style = [
    {
      featureType: "all",
      elementType: "all",
      stylers: [
        { saturation: -80 } // 关键参数：降低 80% 的色彩
      ]
    },
    // 可选：如果您觉得水太暗，可以稍微提亮一点水体（不喜欢的可以删掉下面这段）
    {
      featureType: "water",
      elementType: "geometry",
      stylers: [
        { lightness: 0 }, 
        { saturation: -80 } 
      ]
    }
  ];

  var mapOptions = {
    center: centerPoint,
    
    // ✅ 这里的缩放级别现在是动态的了
    zoom: zoomLevel,
    
    // 应用上面的低饱和度样式
    styles: style,
    
    mapTypeId: google.maps.MapTypeId.ROADMAP,
    backgroundColor: "#f0f0f0", // 背景色设为淡灰，防止加载时闪白
    
    // UI 控件配置：保持简洁，只留缩放
    panControl: false,
    zoomControl: true,
    mapTypeControl: false,
    scaleControl: false,
    streetViewControl: false,
    overviewMapControl: false,
    zoomControlOptions: {
      style: google.maps.ZoomControlStyle.LARGE,
    },
  };

  // 3. 创建地图
  var map = new google.maps.Map(document.getElementById("map"), mapOptions);
  
  // 为了确保样式生效，显式设置 mapType
  var mapType = new google.maps.StyledMapType(style, { name: "Low Saturation" });
  map.mapTypes.set("lowsat", mapType);
  map.setMapTypeId("lowsat");

  // 4. 添加标记 (Marker)
  if (mapMarker) {
    var marker_image = mapMarker;
    var pinIcon = new google.maps.MarkerImage(
      marker_image,
      null,
      null,
      null,
      new google.maps.Size(30, 50) // 根据您的 marker.png 大小微调
    );

    marker = new google.maps.Marker({
      position: centerPoint,
      map: map,
      icon: pinIcon,
      title: mapMarkerName,
    });
  }
};

// 兼容旧的加载方式
var mapElement = document.getElementById("map");
if (mapElement != null) {
  if (typeof google !== 'undefined' && typeof google.maps !== 'undefined') {
      google.maps.event.addDomListener(window, "load", window.initMap);
  }
}