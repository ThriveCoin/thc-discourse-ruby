# frozen_string_literal: true

require 'rails_helper'

describe Jobs::UpdatePostUploadsSecureStatus do
  fab!(:post) { Fabricate(:post) }

  before do
    UploadReference.create!(target: post, upload: Fabricate(:upload))
    UploadReference.create!(target: post, upload: Fabricate(:upload))
  end

  context "when secure uploads is enabled" do
    before do
      setup_s3
      stub_s3_store
      SiteSetting.secure_media = true
    end

    context "when login_required" do
      before { SiteSetting.login_required = true }

      it "updates all the uploads to secure" do
        described_class.new.execute(post_id: post.id)
        post.reload
        expect(post.upload_references.map(&:upload).map(&:secure).all?(true)).to eq(true)
      end

      it "updates all the uploads to secure even if their extension is not authorized" do
        SiteSetting.authorized_extensions = ""
        described_class.new.execute(post_id: post.id)
        post.reload
        expect(post.upload_references.map(&:upload).map(&:secure).all?(true)).to eq(true)
      end
    end
  end
end
