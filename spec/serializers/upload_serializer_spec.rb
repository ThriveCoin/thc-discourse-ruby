# frozen_string_literal: true

RSpec.describe UploadSerializer do
  fab!(:upload) { Fabricate(:upload) }
  let(:subject) { UploadSerializer.new(upload, root: false) }

  it 'should render without errors' do
    json_data = JSON.parse(subject.to_json)

    expect(json_data['id']).to eql upload.id
    expect(json_data['width']).to eql upload.width
    expect(json_data['height']).to eql upload.height
    expect(json_data['thumbnail_width']).to eql upload.thumbnail_width
    expect(json_data['thumbnail_height']).to eql upload.thumbnail_height
    expect(json_data['short_path']).to eql upload.short_path
  end

  context "when the upload is secure" do
    fab!(:upload) { Fabricate(:secure_upload) }

    context "when secure media is disabled" do
      it "just returns the normal URL, otherwise S3 errors are encountered" do
        UrlHelper.expects(:cook_url).with(upload.url, secure: false)
        subject.to_json
      end
    end

    context "when secure media is enabled" do
      before do
        setup_s3
        SiteSetting.secure_media = true
      end

      it "returns the cooked URL based on the upload URL" do
        UrlHelper.expects(:cook_url).with(upload.url, secure: true)
        subject.to_json
      end
    end
  end
end
