import Foundation
import React
import UIKit

struct RestaurantPanelSnapshotPayload {
  struct HoursRow {
    let label: String
    let value: String
  }

  struct Location {
    let title: String
    let status: String?
    let address: String
    let phone: String?
    let hoursRows: [HoursRow]
    let websiteHost: String?
  }

  struct Dish {
    let id: String
    let name: String
    let score: String
    let activity: String
    let pollCount: String
    let totalVotes: String
  }

  let restaurantId: String?
  let restaurantName: String
  let primaryAddress: String
  let shareMessage: String?
  let restaurantScore: String
  let queryScoreLabel: String
  let queryScoreValue: String
  let priceLabel: String
  let hoursSummary: String
  let locationsLabel: String
  let websiteUrl: String?
  let websiteSearchQuery: String?
  let phoneNumber: String?
  let phoneSearchQuery: String?
  let isLoading: Bool
  let isFavorite: Bool
  let favoriteEnabled: Bool
  let showWebsiteAction: Bool
  let showCallAction: Bool
  let matchedTags: [String]
  let locations: [Location]
  let dishes: [Dish]
}

private enum RestaurantPanelSnapshotDecodeError: LocalizedError {
  case expectedObject(path: String, actual: String)
  case expectedArray(path: String, actual: String)
  case expectedString(path: String, actual: String)
  case expectedBoolean(path: String, actual: String)

  var errorDescription: String? {
    switch self {
    case let .expectedObject(path, actual):
      return "Expected object at \(path), received \(actual)"
    case let .expectedArray(path, actual):
      return "Expected array at \(path), received \(actual)"
    case let .expectedString(path, actual):
      return "Expected string at \(path), received \(actual)"
    case let .expectedBoolean(path, actual):
      return "Expected boolean at \(path), received \(actual)"
    }
  }
}

private enum RestaurantPanelSnapshotDecoder {
  static func decode(snapshot bridgeSnapshot: NSDictionary?) throws -> RestaurantPanelSnapshotPayload? {
    guard let bridgeSnapshot else {
      return nil
    }
    guard let snapshot = bridgeSnapshot as? [String: Any] else {
      throw RestaurantPanelSnapshotDecodeError.expectedObject(
        path: "snapshot",
        actual: describe(bridgeSnapshot)
      )
    }
    return try decodePayload(snapshot, path: "snapshot")
  }

  private static func decodePayload(
    _ dictionary: [String: Any],
    path: String
  ) throws -> RestaurantPanelSnapshotPayload {
    RestaurantPanelSnapshotPayload(
      restaurantId: try decodeOptionalString(dictionary, key: "restaurantId", path: path),
      restaurantName: try decodeString(dictionary, key: "restaurantName", path: path),
      primaryAddress: try decodeString(dictionary, key: "primaryAddress", path: path),
      shareMessage: try decodeOptionalString(dictionary, key: "shareMessage", path: path),
      restaurantScore: try decodeString(dictionary, key: "restaurantScore", path: path),
      queryScoreLabel: try decodeString(dictionary, key: "queryScoreLabel", path: path),
      queryScoreValue: try decodeString(dictionary, key: "queryScoreValue", path: path),
      priceLabel: try decodeString(dictionary, key: "priceLabel", path: path),
      hoursSummary: try decodeString(dictionary, key: "hoursSummary", path: path),
      locationsLabel: try decodeString(dictionary, key: "locationsLabel", path: path),
      websiteUrl: try decodeOptionalString(dictionary, key: "websiteUrl", path: path),
      websiteSearchQuery: try decodeOptionalString(dictionary, key: "websiteSearchQuery", path: path),
      phoneNumber: try decodeOptionalString(dictionary, key: "phoneNumber", path: path),
      phoneSearchQuery: try decodeOptionalString(dictionary, key: "phoneSearchQuery", path: path),
      isLoading: try decodeBoolean(dictionary, key: "isLoading", path: path),
      isFavorite: try decodeBoolean(dictionary, key: "isFavorite", path: path),
      favoriteEnabled: try decodeBoolean(dictionary, key: "favoriteEnabled", path: path),
      showWebsiteAction: try decodeBoolean(dictionary, key: "showWebsiteAction", path: path),
      showCallAction: try decodeBoolean(dictionary, key: "showCallAction", path: path),
      matchedTags: try decodeStringArray(dictionary, key: "matchedTags", path: path),
      locations: try decodeArray(dictionary, key: "locations", path: path, transform: decodeLocation),
      dishes: try decodeArray(dictionary, key: "dishes", path: path, transform: decodeDish)
    )
  }

  private static func decodeLocation(
    _ dictionary: [String: Any],
    path: String
  ) throws -> RestaurantPanelSnapshotPayload.Location {
    RestaurantPanelSnapshotPayload.Location(
      title: try decodeString(dictionary, key: "title", path: path),
      status: try decodeOptionalString(dictionary, key: "status", path: path),
      address: try decodeString(dictionary, key: "address", path: path),
      phone: try decodeOptionalString(dictionary, key: "phone", path: path),
      hoursRows: try decodeArray(
        dictionary,
        key: "hoursRows",
        path: path,
        transform: decodeHoursRow
      ),
      websiteHost: try decodeOptionalString(dictionary, key: "websiteHost", path: path)
    )
  }

  private static func decodeHoursRow(
    _ dictionary: [String: Any],
    path: String
  ) throws -> RestaurantPanelSnapshotPayload.HoursRow {
    RestaurantPanelSnapshotPayload.HoursRow(
      label: try decodeString(dictionary, key: "label", path: path),
      value: try decodeString(dictionary, key: "value", path: path)
    )
  }

  private static func decodeDish(
    _ dictionary: [String: Any],
    path: String
  ) throws -> RestaurantPanelSnapshotPayload.Dish {
    RestaurantPanelSnapshotPayload.Dish(
      id: try decodeString(dictionary, key: "id", path: path),
      name: try decodeString(dictionary, key: "name", path: path),
      score: try decodeString(dictionary, key: "score", path: path),
      activity: try decodeString(dictionary, key: "activity", path: path),
      pollCount: try decodeString(dictionary, key: "pollCount", path: path),
      totalVotes: try decodeString(dictionary, key: "totalVotes", path: path)
    )
  }

  private static func decodeArray<Element>(
    _ dictionary: [String: Any],
    key: String,
    path: String,
    transform: ([String: Any], String) throws -> Element
  ) throws -> [Element] {
    let fieldPath = "\(path).\(key)"
    guard let rawArray = dictionary[key] as? [Any] else {
      throw RestaurantPanelSnapshotDecodeError.expectedArray(
        path: fieldPath,
        actual: describe(dictionary[key])
      )
    }
    return try rawArray.enumerated().map { index, element in
      guard let object = element as? [String: Any] else {
        throw RestaurantPanelSnapshotDecodeError.expectedObject(
          path: "\(fieldPath)[\(index)]",
          actual: describe(element)
        )
      }
      return try transform(object, "\(fieldPath)[\(index)]")
    }
  }

  private static func decodeStringArray(
    _ dictionary: [String: Any],
    key: String,
    path: String
  ) throws -> [String] {
    let fieldPath = "\(path).\(key)"
    guard let rawArray = dictionary[key] as? [Any] else {
      throw RestaurantPanelSnapshotDecodeError.expectedArray(
        path: fieldPath,
        actual: describe(dictionary[key])
      )
    }

    return try rawArray.enumerated().map { index, element in
      guard let value = element as? String else {
        throw RestaurantPanelSnapshotDecodeError.expectedString(
          path: "\(fieldPath)[\(index)]",
          actual: describe(element)
        )
      }
      return value
    }
  }

  private static func decodeString(
    _ dictionary: [String: Any],
    key: String,
    path: String
  ) throws -> String {
    let fieldPath = "\(path).\(key)"
    guard let raw = dictionary[key] as? String else {
      throw RestaurantPanelSnapshotDecodeError.expectedString(
        path: fieldPath,
        actual: describe(dictionary[key])
      )
    }
    return raw
  }

  private static func decodeOptionalString(
    _ dictionary: [String: Any],
    key: String,
    path: String
  ) throws -> String? {
    let fieldPath = "\(path).\(key)"
    guard let raw = dictionary[key] else {
      return nil
    }
    if raw is NSNull {
      return nil
    }
    guard let string = raw as? String else {
      throw RestaurantPanelSnapshotDecodeError.expectedString(
        path: fieldPath,
        actual: describe(raw)
      )
    }
    let trimmed = string.trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.isEmpty ? nil : trimmed
  }

  private static func decodeBoolean(
    _ dictionary: [String: Any],
    key: String,
    path: String
  ) throws -> Bool {
    let fieldPath = "\(path).\(key)"
    let raw = dictionary[key]
    if let bool = raw as? Bool {
      return bool
    }
    if let number = raw as? NSNumber {
      return number.boolValue
    }
    throw RestaurantPanelSnapshotDecodeError.expectedBoolean(
      path: fieldPath,
      actual: describe(raw)
    )
  }

  private static func describe(_ raw: Any?) -> String {
    guard let raw else {
      return "nil"
    }
    return String(describing: type(of: raw))
  }
}

private enum RestaurantPanelSnapshotBridgeAdapter {
  static func decodePayload(
    from bridgeSnapshot: NSDictionary?
  ) throws -> RestaurantPanelSnapshotPayload? {
    try RestaurantPanelSnapshotDecoder.decode(snapshot: bridgeSnapshot)
  }
}

@objc(CraveRestaurantPanelSnapshotViewManager)
final class CraveRestaurantPanelSnapshotViewManager: RCTViewManager {
  override static func requiresMainQueueSetup() -> Bool {
    true
  }

  override func view() -> UIView! {
    CraveRestaurantPanelSnapshotView()
  }
}

final class CraveRestaurantPanelSnapshotView: UIView {
  @objc var snapshot: NSDictionary? {
    get { nil }
    set { applyBridgeSnapshot(newValue) }
  }
  @objc var onAction: RCTDirectEventBlock?

  private let rootStack = UIStackView()
  private var snapshotPayload: RestaurantPanelSnapshotPayload?

  override init(frame: CGRect) {
    super.init(frame: frame)
    configure()
  }

  required init?(coder: NSCoder) {
    super.init(coder: coder)
    configure()
  }

  override var intrinsicContentSize: CGSize {
    let fitting = rootStack.systemLayoutSizeFitting(
      CGSize(
        width: bounds.width > 0 ? bounds.width : UIScreen.main.bounds.width,
        height: UIView.layoutFittingCompressedSize.height
      ),
      withHorizontalFittingPriority: .required,
      verticalFittingPriority: .fittingSizeLevel
    )
    return CGSize(width: UIView.noIntrinsicMetric, height: fitting.height)
  }

  private func configure() {
    backgroundColor = .clear
    rootStack.axis = .vertical
    rootStack.spacing = 0
    rootStack.translatesAutoresizingMaskIntoConstraints = false
    addSubview(rootStack)
    NSLayoutConstraint.activate([
      rootStack.topAnchor.constraint(equalTo: topAnchor),
      rootStack.leadingAnchor.constraint(equalTo: leadingAnchor),
      rootStack.trailingAnchor.constraint(equalTo: trailingAnchor),
      rootStack.bottomAnchor.constraint(equalTo: bottomAnchor),
    ])
  }

  private func applyBridgeSnapshot(_ bridgeSnapshot: NSDictionary?) {
    snapshotPayload = decodeSnapshotPayload(from: bridgeSnapshot)
    applySnapshot()
  }

  private func decodeSnapshotPayload(from bridgeSnapshot: NSDictionary?) -> RestaurantPanelSnapshotPayload? {
    do {
      return try RestaurantPanelSnapshotBridgeAdapter.decodePayload(from: bridgeSnapshot)
    } catch {
      NSLog(
        "[CraveRestaurantPanelSnapshotView] Ignoring invalid snapshot payload: %@",
        error.localizedDescription
      )
      return nil
    }
  }

  private func applySnapshot() {
    rootStack.arrangedSubviews.forEach { view in
      rootStack.removeArrangedSubview(view)
      view.removeFromSuperview()
    }
    guard let snapshotPayload else {
      invalidateIntrinsicContentSize()
      setNeedsLayout()
      return
    }

    rootStack.addArrangedSubview(makeHandle())
    rootStack.addArrangedSubview(makeHeader(snapshotPayload))
    rootStack.addArrangedSubview(makeMetricsRow(snapshotPayload))
    rootStack.addArrangedSubview(makePrimaryActionsRow(snapshotPayload))
    rootStack.addArrangedSubview(
      makeDetailRow(label: "Price", value: snapshotPayload.priceLabel)
    )
    rootStack.addArrangedSubview(
      makeDetailRow(label: "Hours", value: snapshotPayload.hoursSummary)
    )
    if !snapshotPayload.matchedTags.isEmpty {
      rootStack.addArrangedSubview(makeMatchedTagsSection(snapshotPayload.matchedTags))
    }

    if !snapshotPayload.locations.isEmpty {
      rootStack.addArrangedSubview(
        makeSectionHeader(
          title: "Locations",
          subtitle: snapshotPayload.locationsLabel
        )
      )
      snapshotPayload.locations.forEach { location in
        rootStack.addArrangedSubview(makeLocationCard(location))
      }
    }

    rootStack.addArrangedSubview(
      makeSectionHeader(title: "Menu highlights", subtitle: "Ranked by dish score")
    )
    if snapshotPayload.isLoading {
      rootStack.addArrangedSubview(makeLoadingState())
    } else if snapshotPayload.dishes.isEmpty {
      rootStack.addArrangedSubview(makeEmptyState())
    } else {
      for (index, dish) in snapshotPayload.dishes.enumerated() {
        rootStack.addArrangedSubview(makeDishCard(dish, rank: index + 1))
      }
    }

    invalidateIntrinsicContentSize()
    setNeedsLayout()
  }

  private func makeHandle() -> UIView {
    let wrapper = UIView()
    wrapper.translatesAutoresizingMaskIntoConstraints = false
    wrapper.heightAnchor.constraint(equalToConstant: 25).isActive = true

    let handle = UIView()
    handle.translatesAutoresizingMaskIntoConstraints = false
    handle.backgroundColor = UIColor(hex: "#d1d5db")
    handle.layer.cornerRadius = 2.5
    wrapper.addSubview(handle)
    NSLayoutConstraint.activate([
      handle.widthAnchor.constraint(equalToConstant: 40),
      handle.heightAnchor.constraint(equalToConstant: 5),
      handle.centerXAnchor.constraint(equalTo: wrapper.centerXAnchor),
      handle.topAnchor.constraint(equalTo: wrapper.topAnchor, constant: 12),
    ])
    return wrapper
  }

  private func makeHeader(_ payload: RestaurantPanelSnapshotPayload) -> UIView {
    let container = UIStackView()
    container.axis = .vertical
    container.spacing = 0
    container.isLayoutMarginsRelativeArrangement = true
    container.layoutMargins = UIEdgeInsets(top: 0, left: 20, bottom: 0, right: 20)

    let row = UIStackView()
    row.axis = .horizontal
    row.alignment = .top
    row.spacing = 12

    let textGroup = UIStackView()
    textGroup.axis = .vertical
    textGroup.spacing = 4

    let title = makeLabel(
      text: payload.restaurantName,
      size: 24,
      weight: .bold,
      color: UIColor(hex: "#0f172a")
    )
    textGroup.addArrangedSubview(title)

    let address = makeLabel(
      text: payload.primaryAddress,
      size: 15,
      weight: .regular,
      color: UIColor(hex: "#475569")
    )
    textGroup.addArrangedSubview(address)
    row.addArrangedSubview(textGroup)

    let actions = UIStackView()
    actions.axis = .horizontal
    actions.spacing = 8
    actions.alignment = .center
    actions.addArrangedSubview(
      makeIconButton(
        systemName: payload.isFavorite ? "heart.fill" : "heart",
        tint: payload.isFavorite ? UIColor(hex: "#ef4444") : UIColor(hex: "#1f2937"),
        enabled: payload.favoriteEnabled
      ) { [weak self] in
        self?.emitAction("favorite")
      }
    )
    actions.addArrangedSubview(
      makeIconButton(systemName: "square.and.arrow.up", tint: UIColor(hex: "#1f2937")) {
        [weak self] in
        self?.emitAction("share")
      }
    )
    actions.addArrangedSubview(
      makeIconButton(systemName: "xmark", tint: UIColor(hex: "#1f2937")) { [weak self] in
        self?.emitAction("close")
      }
    )
    row.addArrangedSubview(actions)
    container.addArrangedSubview(row)

    let divider = UIView()
    divider.translatesAutoresizingMaskIntoConstraints = false
    divider.backgroundColor = UIColor(hex: "#e5e7eb")
    divider.heightAnchor.constraint(equalToConstant: 1).isActive = true
    let dividerWrap = UIView()
    dividerWrap.translatesAutoresizingMaskIntoConstraints = false
    dividerWrap.heightAnchor.constraint(equalToConstant: 17).isActive = true
    dividerWrap.addSubview(divider)
    NSLayoutConstraint.activate([
      divider.leadingAnchor.constraint(equalTo: dividerWrap.leadingAnchor, constant: 20),
      divider.trailingAnchor.constraint(equalTo: dividerWrap.trailingAnchor, constant: -20),
      divider.bottomAnchor.constraint(equalTo: dividerWrap.bottomAnchor),
    ])
    container.addArrangedSubview(dividerWrap)

    return container
  }

  private func makeMetricsRow(_ payload: RestaurantPanelSnapshotPayload) -> UIView {
    let row = UIStackView()
    row.axis = .horizontal
    row.spacing = 12
    row.distribution = .fillEqually
    row.isLayoutMarginsRelativeArrangement = true
    row.layoutMargins = UIEdgeInsets(top: 16, left: 20, bottom: 0, right: 20)

    row.addArrangedSubview(
      makeMetricCard(
        title: "Restaurant score",
        value: payload.restaurantScore
      )
    )
    row.addArrangedSubview(
      makeMetricCard(
        title: payload.queryScoreLabel,
        value: payload.queryScoreValue
      )
    )
    return row
  }

  private func makePrimaryActionsRow(_ payload: RestaurantPanelSnapshotPayload) -> UIView {
    let row = UIStackView()
    row.axis = .horizontal
    row.spacing = 10
    row.isLayoutMarginsRelativeArrangement = true
    row.layoutMargins = UIEdgeInsets(top: 16, left: 20, bottom: 0, right: 20)
    if payload.showWebsiteAction {
      row.addArrangedSubview(makeActionPill(title: "Website") { [weak self] in
        self?.emitAction("website")
      })
    }
    if payload.showCallAction {
      row.addArrangedSubview(makeActionPill(title: "Call") { [weak self] in
        self?.emitAction("call")
      })
    }
    return row
  }

  private func makeMatchedTagsSection(_ matchedTags: [String]) -> UIView {
    let stack = UIStackView()
    stack.axis = .vertical
    stack.spacing = 8
    stack.alignment = .leading
    stack.isLayoutMarginsRelativeArrangement = true
    stack.layoutMargins = UIEdgeInsets(top: 16, left: 20, bottom: 0, right: 20)

    stack.addArrangedSubview(
      makeLabel(text: "Mentioned for", size: 15, weight: .semibold, color: UIColor(hex: "#64748b"))
    )

    let row = UIStackView()
    row.axis = .horizontal
    row.spacing = 8
    row.alignment = .leading
    matchedTags.forEach { tag in
      row.addArrangedSubview(makeTagPill(tag))
    }
    stack.addArrangedSubview(row)

    return stack
  }

  private func makeTagPill(_ label: String) -> UIView {
    let container = UIView()
    container.translatesAutoresizingMaskIntoConstraints = false
    container.backgroundColor = UIColor(hex: "#f8fafc")
    container.layer.cornerRadius = 16
    container.layer.borderWidth = 1
    container.layer.borderColor = UIColor(hex: "#e2e8f0").cgColor

    let text = makeLabel(text: label, size: 13, weight: .semibold, color: UIColor(hex: "#475569"))
    text.translatesAutoresizingMaskIntoConstraints = false
    container.addSubview(text)

    NSLayoutConstraint.activate([
      text.leadingAnchor.constraint(equalTo: container.leadingAnchor, constant: 10),
      text.trailingAnchor.constraint(equalTo: container.trailingAnchor, constant: -10),
      text.topAnchor.constraint(equalTo: container.topAnchor, constant: 6),
      text.bottomAnchor.constraint(equalTo: container.bottomAnchor, constant: -6),
    ])

    return container
  }

  private func makeMetricCard(title: String, value: String) -> UIView {
    let card = UIStackView()
    card.axis = .vertical
    card.spacing = 4
    card.isLayoutMarginsRelativeArrangement = true
    card.layoutMargins = UIEdgeInsets(top: 16, left: 16, bottom: 16, right: 16)
    card.backgroundColor = .white
    card.layer.cornerRadius = 16
    card.layer.borderWidth = 1
    card.layer.borderColor = UIColor(white: 0.06, alpha: 0.08).cgColor

    card.addArrangedSubview(
      makeLabel(text: title, size: 14, weight: .regular, color: UIColor(hex: "#475569"))
    )
    card.addArrangedSubview(
      makeLabel(text: value, size: 24, weight: .bold, color: UIColor(hex: "#0f172a"))
    )
    return card
  }

  private func makeDetailRow(label: String, value: String) -> UIView {
    let row = UIView()
    row.translatesAutoresizingMaskIntoConstraints = false
    let left = makeLabel(text: label, size: 15, weight: .bold, color: UIColor(hex: "#0f172a"))
    let right = makeLabel(text: value, size: 15, weight: .regular, color: UIColor(hex: "#475569"))
    right.textAlignment = .right
    [left, right].forEach {
      $0.translatesAutoresizingMaskIntoConstraints = false
      row.addSubview($0)
    }
    NSLayoutConstraint.activate([
      row.heightAnchor.constraint(greaterThanOrEqualToConstant: 20),
      left.leadingAnchor.constraint(equalTo: row.leadingAnchor, constant: 20),
      left.topAnchor.constraint(equalTo: row.topAnchor, constant: 16),
      left.bottomAnchor.constraint(equalTo: row.bottomAnchor),
      right.leadingAnchor.constraint(greaterThanOrEqualTo: left.trailingAnchor, constant: 12),
      right.trailingAnchor.constraint(equalTo: row.trailingAnchor, constant: -20),
      right.centerYAnchor.constraint(equalTo: left.centerYAnchor),
    ])
    return row
  }

  private func makeSectionHeader(title: String, subtitle: String) -> UIView {
    let stack = UIStackView()
    stack.axis = .vertical
    stack.spacing = 2
    stack.isLayoutMarginsRelativeArrangement = true
    stack.layoutMargins = UIEdgeInsets(top: 24, left: 20, bottom: 0, right: 20)
    stack.addArrangedSubview(
      makeLabel(text: title, size: 18, weight: .bold, color: UIColor(hex: "#0f172a"))
    )
    stack.addArrangedSubview(
      makeLabel(text: subtitle, size: 15, weight: .regular, color: UIColor(hex: "#475569"))
    )
    return stack
  }

  private func makeLocationCard(_ location: RestaurantPanelSnapshotPayload.Location) -> UIView {
    let card = UIStackView()
    card.axis = .vertical
    card.spacing = 10
    card.isLayoutMarginsRelativeArrangement = true
    card.layoutMargins = UIEdgeInsets(top: 12, left: 14, bottom: 12, right: 14)
    card.backgroundColor = .white
    card.layer.cornerRadius = 14
    card.layer.borderWidth = 1
    card.layer.borderColor = UIColor(white: 0.06, alpha: 0.08).cgColor

    let wrapper = UIView()
    wrapper.translatesAutoresizingMaskIntoConstraints = false
    wrapper.layoutMargins = UIEdgeInsets(top: 12, left: 20, bottom: 0, right: 20)
    wrapper.preservesSuperviewLayoutMargins = false
    wrapper.addSubview(card)
    card.translatesAutoresizingMaskIntoConstraints = false
    NSLayoutConstraint.activate([
      card.leadingAnchor.constraint(equalTo: wrapper.leadingAnchor, constant: 20),
      card.trailingAnchor.constraint(equalTo: wrapper.trailingAnchor, constant: -20),
      card.topAnchor.constraint(equalTo: wrapper.topAnchor, constant: 12),
      card.bottomAnchor.constraint(equalTo: wrapper.bottomAnchor),
    ])

    let titleRow = UIView()
    let title = makeLabel(
      text: location.title,
      size: 16,
      weight: .bold,
      color: UIColor(hex: "#0f172a")
    )
    let status = makeLabel(
      text: location.status ?? "",
      size: 14,
      weight: .regular,
      color: UIColor(hex: "#475569")
    )
    [title, status].forEach {
      $0.translatesAutoresizingMaskIntoConstraints = false
      titleRow.addSubview($0)
    }
    NSLayoutConstraint.activate([
      title.leadingAnchor.constraint(equalTo: titleRow.leadingAnchor),
      title.topAnchor.constraint(equalTo: titleRow.topAnchor),
      title.bottomAnchor.constraint(equalTo: titleRow.bottomAnchor),
      status.leadingAnchor.constraint(greaterThanOrEqualTo: title.trailingAnchor, constant: 8),
      status.trailingAnchor.constraint(equalTo: titleRow.trailingAnchor),
      status.centerYAnchor.constraint(equalTo: title.centerYAnchor),
    ])
    card.addArrangedSubview(titleRow)
    card.addArrangedSubview(
      makeLabel(
        text: location.address,
        size: 14,
        weight: .regular,
        color: UIColor(hex: "#475569")
      )
    )
    if let phone = location.phone {
      card.addArrangedSubview(
        makeLabel(
          text: "Phone  \(phone)",
          size: 14,
          weight: .regular,
          color: UIColor(hex: "#475569")
        )
      )
    }
    if !location.hoursRows.isEmpty {
      card.addArrangedSubview(
        makeLabel(text: "Hours", size: 14, weight: .bold, color: UIColor(hex: "#0f172a"))
      )
      for row in location.hoursRows {
        let hourRow = UIView()
        let day = makeLabel(
          text: row.label,
          size: 12,
          weight: .regular,
          color: UIColor(hex: "#475569")
        )
        let value = makeLabel(
          text: row.value,
          size: 12,
          weight: .regular,
          color: UIColor(hex: "#475569")
        )
        value.textAlignment = .right
        [day, value].forEach {
          $0.translatesAutoresizingMaskIntoConstraints = false
          hourRow.addSubview($0)
        }
        NSLayoutConstraint.activate([
          day.leadingAnchor.constraint(equalTo: hourRow.leadingAnchor),
          day.topAnchor.constraint(equalTo: hourRow.topAnchor),
          day.bottomAnchor.constraint(equalTo: hourRow.bottomAnchor),
          day.widthAnchor.constraint(equalToConstant: 32),
          value.leadingAnchor.constraint(equalTo: day.trailingAnchor, constant: 12),
          value.trailingAnchor.constraint(equalTo: hourRow.trailingAnchor),
          value.centerYAnchor.constraint(equalTo: day.centerYAnchor),
        ])
        card.addArrangedSubview(hourRow)
      }
    }
    if let website = location.websiteHost {
      card.addArrangedSubview(
        makeLabel(
          text: "Website  \(website)",
          size: 14,
          weight: .regular,
          color: UIColor(hex: "#475569")
        )
      )
    }
    return wrapper
  }

  private func makeDishCard(_ dish: RestaurantPanelSnapshotPayload.Dish, rank: Int) -> UIView {
    let card = UIView()
    card.backgroundColor = .white

    let rankBadge = UILabel()
    rankBadge.translatesAutoresizingMaskIntoConstraints = false
    rankBadge.text = "\(rank)"
    rankBadge.textAlignment = .center
    rankBadge.font = .systemFont(ofSize: 14, weight: .bold)
    rankBadge.textColor = UIColor(hex: "#b45309")
    rankBadge.backgroundColor = UIColor(hex: "#fef3c7")
    rankBadge.layer.cornerRadius = 16
    rankBadge.layer.masksToBounds = true

    let name = makeLabel(
      text: dish.name,
      size: 16,
      weight: .bold,
      color: UIColor(hex: "#0f172a")
    )
    let meta = makeLabel(
      text: "Dish score: \(dish.score)",
      size: 14,
      weight: .regular,
      color: UIColor(hex: "#475569")
    )
    let activity = makeLabel(
      text: dish.activity,
      size: 14,
      weight: .regular,
      color: UIColor(hex: "#475569")
    )
    [name, meta, activity].forEach { $0.translatesAutoresizingMaskIntoConstraints = false }

    let textColumn = UIStackView(arrangedSubviews: [name, meta])
    textColumn.axis = .vertical
    textColumn.spacing = 2
    textColumn.translatesAutoresizingMaskIntoConstraints = false

    let topRow = UIView()
    [rankBadge, textColumn, activity].forEach { topRow.addSubview($0) }
    NSLayoutConstraint.activate([
      rankBadge.leadingAnchor.constraint(equalTo: topRow.leadingAnchor, constant: 20),
      rankBadge.topAnchor.constraint(equalTo: topRow.topAnchor),
      rankBadge.widthAnchor.constraint(equalToConstant: 32),
      rankBadge.heightAnchor.constraint(equalToConstant: 32),
      textColumn.leadingAnchor.constraint(equalTo: rankBadge.trailingAnchor, constant: 12),
      textColumn.topAnchor.constraint(equalTo: topRow.topAnchor),
      textColumn.bottomAnchor.constraint(equalTo: topRow.bottomAnchor),
      activity.leadingAnchor.constraint(greaterThanOrEqualTo: textColumn.trailingAnchor, constant: 12),
      activity.trailingAnchor.constraint(equalTo: topRow.trailingAnchor, constant: -20),
      activity.centerYAnchor.constraint(equalTo: rankBadge.centerYAnchor),
      topRow.heightAnchor.constraint(greaterThanOrEqualToConstant: 32),
    ])

    let statsRow = UIStackView(arrangedSubviews: [
      makeStatColumn(title: "Poll count", value: dish.pollCount),
      makeStatColumn(title: "Total votes", value: dish.totalVotes),
    ])
    statsRow.axis = .horizontal
    statsRow.spacing = 16
    statsRow.distribution = .fillEqually
    statsRow.translatesAutoresizingMaskIntoConstraints = false

    [topRow, statsRow].forEach { view in
      view.translatesAutoresizingMaskIntoConstraints = false
      card.addSubview(view)
    }
    NSLayoutConstraint.activate([
      topRow.leadingAnchor.constraint(equalTo: card.leadingAnchor),
      topRow.trailingAnchor.constraint(equalTo: card.trailingAnchor),
      topRow.topAnchor.constraint(equalTo: card.topAnchor, constant: 16),
      statsRow.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 20),
      statsRow.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -20),
      statsRow.topAnchor.constraint(equalTo: topRow.bottomAnchor, constant: 14),
      statsRow.bottomAnchor.constraint(equalTo: card.bottomAnchor, constant: -16),
    ])

    return card
  }

  private func makeStatColumn(title: String, value: String) -> UIView {
    let column = UIStackView()
    column.axis = .vertical
    column.spacing = 4
    column.addArrangedSubview(
      makeLabel(text: title, size: 13, weight: .regular, color: UIColor(hex: "#475569"))
    )
    column.addArrangedSubview(
      makeLabel(text: value, size: 15, weight: .bold, color: UIColor(hex: "#0f172a"))
    )
    return column
  }

  private func makeEmptyState() -> UIView {
    let label = makeLabel(
      text: "No dishes found for this restaurant.",
      size: 15,
      weight: .regular,
      color: UIColor(hex: "#475569")
    )
    label.textAlignment = .center
    let wrapper = UIView()
    wrapper.translatesAutoresizingMaskIntoConstraints = false
    wrapper.addSubview(label)
    label.translatesAutoresizingMaskIntoConstraints = false
    NSLayoutConstraint.activate([
      label.leadingAnchor.constraint(equalTo: wrapper.leadingAnchor, constant: 20),
      label.trailingAnchor.constraint(equalTo: wrapper.trailingAnchor, constant: -20),
      label.topAnchor.constraint(equalTo: wrapper.topAnchor, constant: 24),
      label.bottomAnchor.constraint(equalTo: wrapper.bottomAnchor, constant: -40),
    ])
    return wrapper
  }

  private func makeLoadingState() -> UIView {
    let stack = UIStackView()
    stack.axis = .vertical
    stack.spacing = 12
    stack.alignment = .center
    stack.isLayoutMarginsRelativeArrangement = true
    stack.layoutMargins = UIEdgeInsets(top: 28, left: 20, bottom: 48, right: 20)
    let spinner = UIActivityIndicatorView(style: .medium)
    spinner.startAnimating()
    stack.addArrangedSubview(spinner)
    stack.addArrangedSubview(
      makeLabel(
        text: "Loading restaurant details…",
        size: 15,
        weight: .regular,
        color: UIColor(hex: "#475569")
      )
    )
    return stack
  }

  private func makeActionPill(title: String, handler: @escaping () -> Void) -> UIButton {
    let button = UIButton(type: .system)
    var configuration = UIButton.Configuration.filled()
    configuration.title = title
    configuration.baseForegroundColor = UIColor(hex: "#0f172a")
    configuration.baseBackgroundColor = .white
    configuration.cornerStyle = .capsule
    configuration.background.strokeColor = UIColor(white: 0.06, alpha: 0.08)
    configuration.background.strokeWidth = 1
    configuration.contentInsets = NSDirectionalEdgeInsets(
      top: 10,
      leading: 14,
      bottom: 10,
      trailing: 14
    )
    button.configuration = configuration
    button.addAction(UIAction { _ in handler() }, for: .touchUpInside)
    return button
  }

  private func makeIconButton(
    systemName: String,
    tint: UIColor,
    enabled: Bool = true,
    handler: @escaping () -> Void
  ) -> UIButton {
    let button = UIButton(type: .system)
    button.tintColor = tint
    button.isEnabled = enabled
    button.alpha = enabled ? 1 : 0.45
    button.setImage(UIImage(systemName: systemName), for: .normal)
    button.addAction(UIAction { _ in handler() }, for: .touchUpInside)
    return button
  }

  private func makeLabel(text: String, size: CGFloat, weight: UIFont.Weight, color: UIColor)
    -> UILabel
  {
    let label = UILabel()
    label.numberOfLines = 0
    label.text = text
    label.font = .systemFont(ofSize: size, weight: weight)
    label.textColor = color
    return label
  }

  private func emitAction(_ action: String) {
    let payload = snapshotPayload
    onAction?([
      "kind": action,
      "restaurantId": payload?.restaurantId as Any,
      "shareMessage": payload?.shareMessage as Any,
      "websiteUrl": payload?.websiteUrl as Any,
      "websiteSearchQuery": payload?.websiteSearchQuery as Any,
      "phoneNumber": payload?.phoneNumber as Any,
      "phoneSearchQuery": payload?.phoneSearchQuery as Any,
    ])
  }
}

private extension UIColor {
  convenience init(hex: String) {
    let sanitized = hex.replacingOccurrences(of: "#", with: "")
    var value: UInt64 = 0
    Scanner(string: sanitized).scanHexInt64(&value)
    let red = CGFloat((value & 0xFF0000) >> 16) / 255
    let green = CGFloat((value & 0x00FF00) >> 8) / 255
    let blue = CGFloat(value & 0x0000FF) / 255
    self.init(red: red, green: green, blue: blue, alpha: 1)
  }
}
